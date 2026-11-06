"""The GateCheck stack: the game at gatecheck.dengler.io.

The game is the static files in web/, in a private S3 bucket behind CloudFront.
The hosting follows Verified Airline's stack: the dengler.io zone, a DNS-validated
certificate, an origin access control, and security headers on every response.

The content security policy is infra/csp.txt. The browser tests serve the page under
the same file, so a change the page needs shows up there before it reaches the site.
"""

from __future__ import annotations

from pathlib import Path

import aws_cdk as cdk
from aws_cdk import Duration, RemovalPolicy
from aws_cdk import aws_certificatemanager as acm
from aws_cdk import aws_cloudfront as cloudfront
from aws_cdk import aws_cloudfront_origins as origins
from aws_cdk import aws_route53 as route53
from aws_cdk import aws_route53_targets as targets
from aws_cdk import aws_s3 as s3
from constructs import Construct

ZONE_NAME = "dengler.io"
RECORD_NAME = "gatecheck"
HOST = f"{RECORD_NAME}.{ZONE_NAME}"
SITE_URL = f"https://{HOST}/"
POLICY = (Path(__file__).resolve().parent / "csp.txt").read_text().strip()


class GateCheckStack(cdk.Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        zone = route53.HostedZone.from_lookup(self, "Zone", domain_name=ZONE_NAME)
        certificate = acm.Certificate(
            self,
            "Certificate",
            domain_name=HOST,
            validation=acm.CertificateValidation.from_dns(zone),
        )
        site_bucket = s3.Bucket(
            self,
            "SiteBucket",
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
            enforce_ssl=True,
            removal_policy=RemovalPolicy.RETAIN,
        )
        headers_policy = cloudfront.ResponseHeadersPolicy(
            self,
            "SecurityHeadersPolicy",
            comment="CSP and security headers for Gate Check",
            security_headers_behavior=cloudfront.ResponseSecurityHeadersBehavior(
                content_security_policy=cloudfront.ResponseHeadersContentSecurityPolicy(
                    content_security_policy=POLICY,
                    override=True,
                ),
                strict_transport_security=cloudfront.ResponseHeadersStrictTransportSecurity(
                    access_control_max_age=Duration.days(365),
                    include_subdomains=False,
                    override=True,
                ),
                content_type_options=cloudfront.ResponseHeadersContentTypeOptions(override=True),
                referrer_policy=cloudfront.ResponseHeadersReferrerPolicy(
                    referrer_policy=cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
                    override=True,
                ),
                frame_options=cloudfront.ResponseHeadersFrameOptions(
                    frame_option=cloudfront.HeadersFrameOption.DENY, override=True
                ),
            ),
        )
        # A path with no file: S3 answers 403, since the distribution may not list the bucket.
        not_found = [
            cloudfront.ErrorResponse(
                http_status=status,
                response_http_status=404,
                response_page_path="/404.html",
                ttl=Duration.seconds(60),
            )
            for status in (403, 404)
        ]
        distribution = cloudfront.Distribution(
            self,
            "Distribution",
            comment="Gate Check",
            domain_names=[HOST],
            certificate=certificate,
            default_root_object="index.html",
            minimum_protocol_version=cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            http_version=cloudfront.HttpVersion.HTTP2_AND_3,
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            error_responses=not_found,
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(site_bucket),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                response_headers_policy=headers_policy,
            ),
        )
        for record_type, record_class in (("A", route53.ARecord), ("AAAA", route53.AaaaRecord)):
            record_class(
                self,
                f"Site{record_type}Record",
                zone=zone,
                record_name=RECORD_NAME,
                target=route53.RecordTarget.from_alias(targets.CloudFrontTarget(distribution)),
            )
        cdk.CfnOutput(self, "SiteUrl", value=SITE_URL)
        cdk.CfnOutput(self, "SiteBucketName", value=site_bucket.bucket_name)
        cdk.CfnOutput(self, "DistributionId", value=distribution.distribution_id)
        cdk.CfnOutput(self, "DistributionDomainName", value=distribution.distribution_domain_name)
