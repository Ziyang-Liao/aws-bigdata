#!/usr/bin/env bash
#
# deploy.sh — One-click deployment for Light Assistant
#
# Deploys the full stack on a fresh Ubuntu EC2 instance:
#   1. System dependencies (Node.js 22, CDK CLI, jq)
#   2. Project dependencies (npm install)
#   3. Express backend (systemd service)
#   4. CloudFront + ALB + S3 (CDK)
#   5. Lambda function (light-tools)
#   6. AgentCore Runtime + MCP Gateway (CDK)
#   7. Outputs the public CloudFront URL
#
# Prerequisites:
#   - Ubuntu 22.04+ EC2 instance with an IAM role that has AdministratorAccess
#     (or at minimum: Bedrock, Lambda, IAM, CloudFormation, S3, CloudFront,
#      ELB, EC2, ECR, CodeBuild, AgentCore permissions)
#   - Kimi K2.5 model enabled in AWS Bedrock console (region: us-east-1)
#   - Internet access from the EC2 instance
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
#
set -euo pipefail

# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

info()    { echo -e "  ${CYAN}INFO${NC}   $*"; }
ok()      { echo -e "  ${GREEN} OK ${NC}   $*"; }
warn()    { echo -e "  ${YELLOW}WARN${NC}   $*"; }
fail()    { echo -e "  ${RED}FAIL${NC}   $*"; exit 1; }
divider() { echo -e "\n${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

step() {
  divider
  echo -e "${BOLD}  Step $1 │ $2${NC}"
  divider
}

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR"
SECONDS=0

echo ""
echo -e "${BOLD}${GREEN}  Light Assistant — One-Click Deploy${NC}"
echo -e "${DIM}  $(date '+%Y-%m-%d %H:%M:%S')${NC}"

# ─────────────────────────────────────────────────────────────────────────────
# Step 0: Pre-flight checks
# ─────────────────────────────────────────────────────────────────────────────
step 0 "Pre-flight checks"

# AWS CLI
if ! command -v aws &>/dev/null; then
  info "Installing AWS CLI v2..."
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o /tmp/awscliv2.zip
  (cd /tmp && unzip -qo awscliv2.zip && sudo ./aws/install --update 2>/dev/null)
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi
ok "AWS CLI: $(aws --version 2>&1 | head -1)"

# Credentials
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text 2>/dev/null) \
  || fail "AWS credentials not configured.\n         Attach an IAM role to this EC2 instance, or run: aws configure"

REGION=$(aws ec2 describe-availability-zones --query 'AvailabilityZones[0].RegionName' --output text 2>/dev/null \
  || echo "us-east-1")
export AWS_DEFAULT_REGION="$REGION"

info "Account:  $ACCOUNT_ID"
info "Region:   $REGION"

# EC2 instance metadata (IMDSv2)
IMDS_TOKEN=$(curl -sf -X PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null) \
  || fail "Not running on EC2 (instance metadata unavailable)."

imds() { curl -sf -H "X-aws-ec2-metadata-token: $IMDS_TOKEN" "http://169.254.169.254/latest/meta-data/$1"; }

INSTANCE_ID=$(imds instance-id)
PRIVATE_IP=$(imds local-ipv4)
MAC=$(imds mac)
VPC_ID=$(imds "network/interfaces/macs/$MAC/vpc-id")
SG_ID=$(imds "network/interfaces/macs/$MAC/security-group-ids" | head -1)

info "Instance: $INSTANCE_ID"
info "VPC:      $VPC_ID"
info "SG:       $SG_ID"
info "Private:  $PRIVATE_IP"

ok "Pre-flight passed"

# ─────────────────────────────────────────────────────────────────────────────
# Step 1: System dependencies
# ─────────────────────────────────────────────────────────────────────────────
step 1 "System dependencies"

# Node.js 22
if ! node --version 2>/dev/null | grep -q "^v2[2-9]"; then
  info "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null 2>&1
  sudo apt-get install -y nodejs >/dev/null 2>&1
fi
ok "Node.js $(node --version)"

# jq
if ! command -v jq &>/dev/null; then
  sudo apt-get install -y -qq jq >/dev/null 2>&1
fi
ok "jq $(jq --version)"

# AWS CDK CLI
if ! command -v cdk &>/dev/null; then
  info "Installing AWS CDK CLI..."
  sudo npm install -g aws-cdk >/dev/null 2>&1
fi
ok "CDK $(cdk --version 2>&1 | head -1)"

# esbuild (for Lambda bundling)
if ! command -v esbuild &>/dev/null; then
  info "Installing esbuild..."
  sudo npm install -g esbuild >/dev/null 2>&1
fi
ok "esbuild $(esbuild --version)"

ok "All system dependencies ready"

# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Project dependencies
# ─────────────────────────────────────────────────────────────────────────────
step 2 "Project dependencies (npm install)"

info "Root project..."
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -3
ok "Root: done"

info "infra/ CDK project..."
(cd "$PROJECT_DIR/infra" && npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -3)
ok "infra/: done"

info "agentcore/cdk/ project..."
(cd "$PROJECT_DIR/agentcore/cdk" && npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -3)
ok "agentcore/cdk/: done"

# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Build & start Express backend
# ─────────────────────────────────────────────────────────────────────────────
step 3 "Build and start Express backend"

info "Compiling TypeScript..."
npm run build 2>&1 | tail -3
ok "Compiled to dist/"

# Create systemd user directory
mkdir -p ~/.config/systemd/user

# Create backend service (without AGENTCORE_ARN — REST + health check work)
cat > ~/.config/systemd/user/light-backend.service << EOF
[Unit]
Description=Light Assistant Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which npx) tsx src/server.ts
Restart=always
RestartSec=2
Environment=PORT=8080
Environment=AWS_REGION=$REGION

[Install]
WantedBy=default.target
EOF

# Enable lingering for systemd user services to survive logout
loginctl enable-linger "$(whoami)" 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user restart light-backend
systemctl --user enable light-backend 2>/dev/null

info "Waiting for backend health check..."
for i in $(seq 1 30); do
  curl -sf http://localhost:8080/api/health >/dev/null 2>&1 && break
  [ "$i" -eq 30 ] && fail "Backend did not start.\n         Check: journalctl --user -u light-backend --no-pager -n 30"
  sleep 1
done
ok "Backend running on port 8080"

# ─────────────────────────────────────────────────────────────────────────────
# Step 4: CDK — CloudFront + ALB + S3
# ─────────────────────────────────────────────────────────────────────────────
step 4 "Deploy infrastructure (CloudFront + ALB + S3)"

cd "$PROJECT_DIR/infra"

# ── Patch hardcoded values ──
info "Patching infra configs for this account/instance..."

# bin/infra.ts — account + region
sed -i "s/account: '[0-9]*'/account: '$ACCOUNT_ID'/" bin/infra.ts
sed -i "s/region: '[a-z0-9-]*'/region: '$REGION'/" bin/infra.ts

# lib/infra-stack.ts — VPC, EC2 instance, Security Group
sed -i "s/vpcId: 'vpc-[a-z0-9]*'/vpcId: '$VPC_ID'/"                        lib/infra-stack.ts
sed -i "s/InstanceIdTarget('[^']*'/InstanceIdTarget('$INSTANCE_ID'/"         lib/infra-stack.ts
sed -i "s/fromSecurityGroupId(this, 'EC2SG', '[^']*'/fromSecurityGroupId(this, 'EC2SG', '$SG_ID'/" lib/infra-stack.ts

ok "Patched with: VPC=$VPC_ID  EC2=$INSTANCE_ID  SG=$SG_ID"

# CDK bootstrap
info "CDK bootstrap..."
cdk bootstrap "aws://$ACCOUNT_ID/$REGION" 2>&1 | grep -E '(Bootstrapping|✅|already)' || true
ok "CDK bootstrapped"

# Deploy
info "Deploying FrontendStack (2-5 min)..."
npx cdk deploy --require-approval never 2>&1 | tail -15

# Capture outputs
CLOUDFRONT_URL=$(aws cloudformation describe-stacks \
  --stack-name FrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='CloudFrontURL'].OutputValue" \
  --output text) || fail "Could not read CloudFront URL from stack outputs"

ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name FrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='ALBDnsName'].OutputValue" \
  --output text)

S3_BUCKET=$(aws cloudformation describe-stacks \
  --stack-name FrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='S3BucketName'].OutputValue" \
  --output text)

ok "CloudFront: $CLOUDFRONT_URL"
ok "ALB:        $ALB_DNS"
ok "S3:         $S3_BUCKET"

cd "$PROJECT_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# Step 5: Deploy Skill Lambdas (device-control, scene-orchestration, device-discovery)
# ─────────────────────────────────────────────────────────────────────────────
step 5 "Deploy Skill Lambda functions"

LAMBDA_ROLE_NAME="light-lambda-execution-role"

# ── IAM Role (shared across all skill lambdas) ──
LAMBDA_ROLE_ARN=$(aws iam get-role --role-name "$LAMBDA_ROLE_NAME" \
  --query "Role.Arn" --output text 2>/dev/null || echo "")

if [ -z "$LAMBDA_ROLE_ARN" ] || [ "$LAMBDA_ROLE_ARN" = "None" ]; then
  info "Creating Lambda execution role..."
  LAMBDA_ROLE_ARN=$(aws iam create-role \
    --role-name "$LAMBDA_ROLE_NAME" \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": { "Service": "lambda.amazonaws.com" },
        "Action": "sts:AssumeRole"
      }]
    }' \
    --query "Role.Arn" --output text)

  aws iam attach-role-policy \
    --role-name "$LAMBDA_ROLE_NAME" \
    --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"

  info "Waiting for IAM role propagation (10s)..."
  sleep 10
fi
ok "Lambda role: $LAMBDA_ROLE_ARN"

EC2_BASE_URL="http://$ALB_DNS"

# ── Deploy each Skill Lambda ──
SKILL_LAMBDAS=("device-control" "scene-orchestration" "device-discovery")

for SKILL in "${SKILL_LAMBDAS[@]}"; do
  LAMBDA_NAME="light-${SKILL}"
  info "Deploying skill: ${SKILL} → Lambda: ${LAMBDA_NAME}"

  LAMBDA_BUILD="/tmp/light-lambda-${SKILL}-$$"
  rm -rf "$LAMBDA_BUILD" && mkdir -p "$LAMBDA_BUILD"

  esbuild "lambda/${SKILL}/index.ts" \
    --bundle --platform=node --target=node22 --format=esm \
    --outfile="$LAMBDA_BUILD/index.mjs" 2>&1 | grep -v "^$" || true

  (cd "$LAMBDA_BUILD" && zip -qj function.zip index.mjs)

  if aws lambda get-function --function-name "$LAMBDA_NAME" &>/dev/null; then
    aws lambda update-function-code \
      --function-name "$LAMBDA_NAME" \
      --zip-file "fileb://$LAMBDA_BUILD/function.zip" \
      --output text --query FunctionArn >/dev/null
    aws lambda wait function-updated --function-name "$LAMBDA_NAME"
    aws lambda update-function-configuration \
      --function-name "$LAMBDA_NAME" \
      --environment "Variables={EC2_BASE_URL=$EC2_BASE_URL}" \
      --output text --query FunctionArn >/dev/null
  else
    aws lambda create-function \
      --function-name "$LAMBDA_NAME" \
      --runtime nodejs22.x --handler index.handler \
      --role "$LAMBDA_ROLE_ARN" \
      --zip-file "fileb://$LAMBDA_BUILD/function.zip" \
      --timeout 30 --memory-size 256 \
      --environment "Variables={EC2_BASE_URL=$EC2_BASE_URL}" \
      --output text --query FunctionArn >/dev/null
    aws lambda wait function-active --function-name "$LAMBDA_NAME"
  fi

  ok "Skill Lambda: arn:aws:lambda:$REGION:$ACCOUNT_ID:function:$LAMBDA_NAME"
  rm -rf "$LAMBDA_BUILD"
done

# ─────────────────────────────────────────────────────────────────────────────
# Step 6: Deploy AgentCore Runtime + MCP Gateway
# ─────────────────────────────────────────────────────────────────────────────
step 6 "Deploy AgentCore (Runtime + MCP Gateway)"

# ── Patch agentcore configs ──
info "Patching agentcore configs..."

# aws-targets.json — account + region
cat > agentcore/aws-targets.json << EOF
[
  {
    "name": "default",
    "region": "$REGION",
    "account": "$ACCOUNT_ID"
  }
]
EOF

# agentcore.json — Skill Lambda ARNs
for SKILL in device-control scene-orchestration device-discovery; do
  sed -i "s|arn:aws:lambda:[a-z0-9-]*:[0-9]*:function:light-${SKILL}|arn:aws:lambda:$REGION:$ACCOUNT_ID:function:light-${SKILL}|g" \
    agentcore/agentcore.json
done

ok "agentcore configs patched"

# ── Deploy via AgentCore CDK stack ──
cd "$PROJECT_DIR/agentcore/cdk"

info "Building AgentCore CDK..."
npx tsc 2>&1 | head -5 || true

info "Deploying AgentCore stack (5-10 min, includes Docker build via CodeBuild)..."
npx cdk deploy --require-approval never 2>&1 | tail -20

AGENTCORE_STACK="AgentCore-light-default"

# ── Extract Runtime ARN ──
# Try CloudFormation outputs first
AGENTCORE_ARN=$(aws cloudformation describe-stacks \
  --stack-name "$AGENTCORE_STACK" \
  --query "Stacks[0].Outputs[?contains(OutputKey,'RuntimeArn') || contains(OutputKey,'runtimeArn')].OutputValue" \
  --output text 2>/dev/null | head -1)

# Try deployed-state.json (populated by agentcore CLI)
if [ -z "$AGENTCORE_ARN" ] || [ "$AGENTCORE_ARN" = "None" ]; then
  AGENTCORE_ARN=$(jq -r '.targets.default.resources.agents.light.runtimeArn // empty' \
    "$PROJECT_DIR/agentcore/.cli/deployed-state.json" 2>/dev/null || echo "")
fi

# Try listing CloudFormation resources
if [ -z "$AGENTCORE_ARN" ]; then
  RUNTIME_ID=$(aws cloudformation list-stack-resources \
    --stack-name "$AGENTCORE_STACK" \
    --query "StackResourceSummaries[?contains(ResourceType,'Runtime')].PhysicalResourceId" \
    --output text 2>/dev/null | head -1)
  if [ -n "$RUNTIME_ID" ] && [ "$RUNTIME_ID" != "None" ]; then
    AGENTCORE_ARN="arn:aws:bedrock-agentcore:$REGION:$ACCOUNT_ID:runtime/$RUNTIME_ID"
  fi
fi

if [ -z "$AGENTCORE_ARN" ]; then
  warn "Could not auto-detect AgentCore Runtime ARN."
  warn "After deployment, find it in the AWS Console under Bedrock > AgentCore > Runtimes"
  warn "Then set it manually:"
  warn "  sed -i 's|Environment=AGENTCORE_ARN=.*|Environment=AGENTCORE_ARN=<YOUR_ARN>|' ~/.config/systemd/user/light-backend.service"
  warn "  systemctl --user daemon-reload && systemctl --user restart light-backend"
  AGENTCORE_ARN="(not detected — see above)"
else
  ok "AgentCore Runtime: $AGENTCORE_ARN"
fi

cd "$PROJECT_DIR"

# ─────────────────────────────────────────────────────────────────────────────
# Step 7: Configure backend with AgentCore + start frontend
# ─────────────────────────────────────────────────────────────────────────────
step 7 "Finalize backend + frontend services"

# ── Update backend service with AGENTCORE_ARN ──
cat > ~/.config/systemd/user/light-backend.service << EOF
[Unit]
Description=Light Assistant Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which npx) tsx src/server.ts
Restart=always
RestartSec=2
Environment=PORT=8080
Environment=AWS_REGION=$REGION
Environment=AGENTCORE_ARN=$AGENTCORE_ARN

[Install]
WantedBy=default.target
EOF

# ── Create frontend service ──
cat > ~/.config/systemd/user/light-frontend.service << EOF
[Unit]
Description=Light Assistant Frontend (dev)
After=network.target

[Service]
Type=simple
WorkingDirectory=$PROJECT_DIR
ExecStart=$(which npx) tsx src/frontend.ts
Restart=always
RestartSec=2
Environment=FRONTEND_PORT=8000
Environment=BACKEND_URL=http://localhost:8080

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user restart light-backend
systemctl --user enable  light-backend 2>/dev/null
systemctl --user restart light-frontend
systemctl --user enable  light-frontend 2>/dev/null

info "Waiting for backend to restart..."
for i in $(seq 1 30); do
  curl -sf http://localhost:8080/api/health >/dev/null 2>&1 && break
  [ "$i" -eq 30 ] && fail "Backend did not restart.\n         Check: journalctl --user -u light-backend --no-pager -n 30"
  sleep 1
done
ok "Backend restarted with AgentCore"

# Verify frontend
sleep 2
if curl -sf http://localhost:8000/ >/dev/null 2>&1; then
  ok "Frontend running on port 8000"
else
  warn "Frontend on port 8000 not responding (non-critical, CloudFront serves static files from S3)"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Step 8: CloudFront cache invalidation
# ─────────────────────────────────────────────────────────────────────────────
step 8 "Invalidate CloudFront cache"

CF_DIST_ID=$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?contains(DomainName,'$(echo "$CLOUDFRONT_URL" | sed 's|https://||')')].Id" \
  --output text 2>/dev/null || echo "")

if [ -n "$CF_DIST_ID" ] && [ "$CF_DIST_ID" != "None" ]; then
  aws cloudfront create-invalidation \
    --distribution-id "$CF_DIST_ID" \
    --paths "/*" >/dev/null 2>&1
  ok "Cache invalidation triggered (takes ~1 min)"
else
  warn "Could not find CloudFront distribution ID for invalidation"
fi

# ─────────────────────────────────────────────────────────────────────────────
# Done!
# ─────────────────────────────────────────────────────────────────────────────
ELAPSED=$SECONDS
MINS=$((ELAPSED / 60))
SECS=$((ELAPSED % 60))

echo ""
echo ""
echo -e "${GREEN}${BOLD}  ╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}${BOLD}  ║                                                           ║${NC}"
echo -e "${GREEN}${BOLD}  ║       Light Assistant — Deployment Complete!         ║${NC}"
echo -e "${GREEN}${BOLD}  ║                                                           ║${NC}"
echo -e "${GREEN}${BOLD}  ╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}                                                           ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  ${BOLD}Demo URL${NC}                                                ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  ${CYAN}${BOLD}$CLOUDFRONT_URL${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}                                                           ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}                                                           ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  Backend (API)      http://localhost:8080                  ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  Frontend (dev)     http://localhost:8000                  ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  ALB                http://$ALB_DNS"
echo -e "${GREEN}${BOLD}  ║${NC}                                                           ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  EC2 Instance       $INSTANCE_ID"
echo -e "${GREEN}${BOLD}  ║${NC}  S3 Bucket          $S3_BUCKET"
echo -e "${GREEN}${BOLD}  ║${NC}  Lambda             $LAMBDA_ARN"
echo -e "${GREEN}${BOLD}  ║${NC}  AgentCore          $AGENTCORE_ARN"
echo -e "${GREEN}${BOLD}  ║${NC}                                                           ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}  Deploy time         ${MINS}m ${SECS}s                              ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ║${NC}                                                           ${GREEN}${BOLD}║${NC}"
echo -e "${GREEN}${BOLD}  ╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo -e "  ${DIM}Backend logs${NC}    journalctl --user -u light-backend -f"
echo -e "  ${DIM}Frontend logs${NC}   journalctl --user -u light-frontend -f"
echo -e "  ${DIM}Restart${NC}         systemctl --user restart light-backend"
echo -e "  ${DIM}Update static${NC}   cd infra && npx cdk deploy"
echo -e "  ${DIM}Invalidate CDN${NC}  aws cloudfront create-invalidation --distribution-id $CF_DIST_ID --paths '/*'"
echo ""
echo -e "  ${YELLOW}Note: CloudFront may take 3-5 minutes to fully propagate after first deploy.${NC}"
echo -e "  ${YELLOW}      If the demo URL shows errors, wait a moment and refresh.${NC}"
echo ""
