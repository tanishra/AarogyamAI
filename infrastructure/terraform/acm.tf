# ACM Certificate for HTTPS
resource "aws_acm_certificate" "main" {
  domain_name       = "admin.example.com"  # Replace with actual domain
  validation_method = "DNS"

  subject_alternative_names = [
    "*.admin.example.com"
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "admin-panel-cert-${var.environment}"
  }
}

# Note: DNS validation records need to be created manually or via Route53
# resource "aws_route53_record" "cert_validation" {
#   for_each = {
#     for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
#       name   = dvo.resource_record_name
#       record = dvo.resource_record_value
#       type   = dvo.resource_record_type
#     }
#   }
#
#   allow_overwrite = true
#   name            = each.value.name
#   records         = [each.value.record]
#   ttl             = 60
#   type            = each.value.type
#   zone_id         = aws_route53_zone.main.zone_id
# }
