"""What the stack must hold: a private bucket, the game's address, and a tight policy."""

import aws_cdk as cdk
from aws_cdk.assertions import Match, Template
from stack import HOST, POLICY, GateCheckStack


def template():
    app = cdk.App()
    env = cdk.Environment(account="123456789012", region="us-east-1")
    return Template.from_stack(GateCheckStack(app, "Test", env=env))


def test_the_bucket_is_private():
    template().has_resource_properties(
        "AWS::S3::Bucket",
        {
            "PublicAccessBlockConfiguration": {
                "BlockPublicAcls": True,
                "BlockPublicPolicy": True,
                "IgnorePublicAcls": True,
                "RestrictPublicBuckets": True,
            }
        },
    )


def test_the_site_answers_at_its_address_over_https():
    template().has_resource_properties(
        "AWS::CloudFront::Distribution",
        {
            "DistributionConfig": Match.object_like(
                {
                    "Aliases": [HOST],
                    "DefaultCacheBehavior": Match.object_like({"ViewerProtocolPolicy": "redirect-to-https"}),
                }
            )
        },
    )


def test_dns_points_both_address_families_at_the_site():
    records = template()
    for kind in ("A", "AAAA"):
        records.has_resource_properties("AWS::Route53::RecordSet", {"Name": f"{HOST}.", "Type": kind})


def test_the_policy_allows_lean_and_no_other_script():
    assert "script-src 'self' 'wasm-unsafe-eval';" in POLICY
    assert "'unsafe-eval'" not in POLICY
    assert "script-src 'self' 'unsafe-inline'" not in POLICY
    template().has_resource_properties(
        "AWS::CloudFront::ResponseHeadersPolicy",
        {
            "ResponseHeadersPolicyConfig": Match.object_like(
                {
                    "SecurityHeadersConfig": Match.object_like(
                        {"ContentSecurityPolicy": {"ContentSecurityPolicy": POLICY, "Override": True}}
                    )
                }
            )
        },
    )
