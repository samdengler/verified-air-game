"""CDK app entry. The game's site, in us-east-1, where CloudFront's certificate must be."""

import os

import aws_cdk as cdk
from stack import GateCheckStack

app = cdk.App()
GateCheckStack(
    app,
    "GateCheck",
    env=cdk.Environment(account=os.environ.get("CDK_DEFAULT_ACCOUNT"), region="us-east-1"),
    description="Gate Check: the site at gatecheck.dengler.io",
)
app.synth()
