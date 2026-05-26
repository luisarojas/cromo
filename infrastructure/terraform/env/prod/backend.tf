terraform {
  required_version = ">= 1.7.0"
  backend "s3" {
    bucket         = "cromo-tfstate-REPLACE_WITH_ACCOUNT_ID"
    key            = "env/prod/terraform.tfstate"
    region         = "ca-central-1"
    dynamodb_table = "cromo-tfstate-lock"
    encrypt        = true
  }
}
