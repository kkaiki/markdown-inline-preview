# Existing repository — must be imported before the first apply:
#   terraform import github_repository.this markdown-inline-preview
#
# Values below mirror the repository's current live settings (fetched via
# `gh api repos/kkaiki/markdown-inline-preview`) so that importing and
# applying does not change anything except delete_branch_on_merge.
resource "github_repository" "this" {
  name         = "markdown-inline-preview"
  description  = ""
  homepage_url = ""
  visibility   = "public"

  has_issues      = true
  has_projects    = true
  has_wiki        = true
  has_downloads   = true
  has_discussions = false

  allow_merge_commit  = true
  allow_squash_merge  = true
  allow_rebase_merge  = true
  allow_auto_merge    = false
  allow_update_branch = false

  # This is the setting that deletes a branch automatically once its PR is
  # merged into any base branch (main, dev, ...).
  delete_branch_on_merge = true

  archived    = false
  is_template = false
  topics      = []

  lifecycle {
    # Settings we don't want Terraform to fight over (managed elsewhere /
    # changed ad-hoc from the GitHub UI).
    ignore_changes = [
      squash_merge_commit_title,
      squash_merge_commit_message,
      merge_commit_title,
      merge_commit_message,
    ]
  }
}
