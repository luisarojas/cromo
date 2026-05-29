terraform {
  required_version = ">= 1.7.0"
  backend "s3" {
    bucket       = "cromo-tfstate-584133415742"
    key          = "env/dev/terraform.tfstate"
    region       = "ca-central-1"
    profile      = "cromo"
    use_lockfile = true
    encrypt      = true
  }
}
