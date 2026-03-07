## ADDED Requirements

### Requirement: OAuth Integration for GitHub
The system SHALL support GitHub OAuth 2.0 for admin authentication.

#### Scenario: Admin authorizes GitHub app
- **WHEN** the admin clicks "Connect GitHub" button
- **THEN** the system redirects to GitHub authorization URL
- **THEN** the authorization request includes required scopes (repo, admin:repo_hook)
- **THEN** GitHub prompts admin to authorize the app
- **THEN** admin grants authorization to GitHub

#### Scenario: GitHub OAuth callback handling
- **WHEN** GitHub redirects back with authorization code
- **THEN** the system exchanges authorization code for access token
- **THEN** the system stores access token in SQLite database
- **THEN** the system stores refresh token if provided
- **THEN** the system stores installation metadata (account, permissions)

#### Scenario: GitHub token refresh
- **WHEN** the stored GitHub access token expires
- **THEN** the system retrieves refresh token from database
- **THEN** the system exchanges refresh token for new access token
- **THEN** the system updates stored access token
- **THEN** the system updates token expiration timestamp

### Requirement: OAuth Integration for Gitee
The system SHALL support Gitee OAuth 2.0 for admin authentication.

#### Scenario: Admin authorizes Gitee app
- **WHEN** the admin clicks "Connect Gitee" button
- **THEN** the system redirects to Gitee authorization URL
- **THEN** the authorization request includes required scopes (projects, pull_requests)
- **THEN** Gitee prompts admin to authorize the app
- **THEN** admin grants authorization to Gitee

#### Scenario: Gitee OAuth callback handling
- **WHEN** Gitee redirects back with authorization code
- **THEN** the system exchanges authorization code for access token
- **THEN** the system stores access token in SQLite database
- **THEN** the system stores installation metadata (account, permissions)

#### Scenario: Gitee token refresh
- **WHEN** the stored Gitee access token expires
- **THEN** the system retrieves the installation from database
- **THEN** the system exchanges expired token for new access token
- **THEN** the system updates stored access token
- **THEN** the system updates token expiration timestamp

### Requirement: OAuth Integration for GitLab
The system SHALL support GitLab OAuth 2.0 for admin authentication.

#### Scenario: Admin authorizes GitLab app
- **WHEN** the admin clicks "Connect GitLab" button
- **THEN** the system redirects to GitLab authorization URL
- **THEN** the authorization request includes required scopes (api, read_repository)
- **THEN** GitLab prompts admin to authorize the app
- **THEN** admin grants authorization to GitLab

#### Scenario: GitLab OAuth callback handling
- **WHEN** GitLab redirects back with authorization code
- **THEN** the system exchanges authorization code for access token
- **THEN** the system stores access token in SQLite database
- **THEN** the system stores refresh token if provided
- **THEN** the system stores installation metadata (account, permissions)

#### Scenario: GitLab token refresh
- **WHEN** the stored GitLab access token expires
- **THEN** the system retrieves refresh token from database
- **THEN** the system exchanges refresh token for new access token
- **THEN** the system updates stored access token
- **THEN** the system updates token expiration timestamp

### Requirement: OAuth Configuration
The system SHALL load OAuth configuration from environment variables.

#### Scenario: Load GitHub OAuth configuration
- **WHEN** the system starts
- **THEN** the system reads GITHUB_CLIENT_ID environment variable
- **THEN** the system reads GITHUB_CLIENT_SECRET environment variable
- **THEN** the system reads GITHUB_CALLBACK_URL environment variable
- **THEN** the system validates required GitHub OAuth variables are set

#### Scenario: Load Gitee OAuth configuration
- **WHEN** the system starts
- **THEN** the system reads GITEE_CLIENT_ID environment variable
- **THEN** the system reads GITEE_CLIENT_SECRET environment variable
- **THEN** the system reads GITEE_CALLBACK_URL environment variable
- **THEN** the system validates required Gitee OAuth variables are set

#### Scenario: Load GitLab OAuth configuration
- **WHEN** the system starts
- **THEN** the system reads GITLAB_CLIENT_ID environment variable
- **THEN** the system reads GITLAB_CLIENT_SECRET environment variable
- **THEN** the system reads GITLAB_CALLBACK_URL environment variable
- **THEN** the system validates required GitLab OAuth variables are set

### Requirement: OAuth Token Storage
The system SHALL store OAuth tokens securely in SQLite database.

#### Scenario: Store OAuth installation
- **WHEN** OAuth authorization completes
- **THEN** the system stores platform type (GitHub/Gitee/GitLab)
- **THEN** the system stores encrypted access token
- **THEN** the system stores encrypted refresh token if applicable
- **THEN** the system stores token expiration timestamp
- **THEN** the system stores platform-specific metadata

#### Scenario: Retrieve OAuth token
- **WHEN** the system needs to access platform API
- **THEN** the system retrieves installation from database
- **THEN** the system decrypts access token
- **THEN** the system validates token is not expired
- **THEN** the system refreshes token if expired
- **THEN** the system returns valid access token

### Requirement: OAuth Error Handling
The system SHALL handle OAuth errors gracefully.

#### Scenario: OAuth authorization denied
- **WHEN** admin denies OAuth authorization
- **THEN** the system receives authorization denied response
- **THEN** the system displays user-friendly error message
- **THEN** the system allows retry of authorization flow

#### Scenario: OAuth token exchange failure
- **WHEN** token exchange fails (invalid code, client error)
- **THEN** the system logs the error details
- **THEN** the system displays user-friendly error message
- **THEN** the system may include troubleshooting information

#### Scenario: OAuth token refresh failure
- **WHEN** token refresh fails
- **THEN** the system logs the error details
- **THEN** the system notifies admin to reauthorize
- **THEN** the system provides reauthorization button
- **THEN** the system marks installation as requiring reauthorization

### Requirement: OAuth Installation Management
The system SHALL allow admin to manage OAuth installations.

#### Scenario: List OAuth installations
- **WHEN** admin views OAuth integrations
- **THEN** the system displays all connected platforms
- **THEN** the system displays connection status for each platform
- **THEN** the system displays token expiration status
- **THEN** the system provides action buttons (disconnect, refresh)

#### Scenario: Disconnect OAuth installation
- **WHEN** admin clicks "Disconnect" for a platform
- **THEN** the system confirms the disconnection
- **THEN** the system removes installation record from database
- **THEN** the system revokes OAuth token if possible
- **THEN** the system removes associated webhooks if possible

#### Scenario: Reauthorize OAuth installation
- **WHEN** admin clicks "Reauthorize" for expired installation
- **THEN** the system initiates OAuth flow again
- **THEN** the system uses existing client credentials
- **THEN** the system updates installation record with new tokens
- **THEN** the system restores webhook connections if needed

### Requirement: OAuth Webhook Setup
The system SHALL automatically set up webhooks after OAuth authorization.

#### Scenario: Setup GitHub webhook
- **WHEN** GitHub OAuth authorization completes
- **THEN** the system registers webhook for PR events
- **THEN** the system provides webhook secret for signature verification
- **THEN** the system stores webhook ID in installation record
- **THEN** the system tests webhook delivery

#### Scenario: Setup Gitee webhook
- **WHEN** Gitee OAuth authorization completes
- **THEN** the system registers webhook for PR events
- **THEN** the system provides webhook secret for signature verification
- **THEN** the system stores webhook ID in installation record
- **THEN** the system tests webhook delivery

#### Scenario: Setup GitLab webhook
- **WHEN** GitLab OAuth authorization completes
- **THEN** the system registers webhook for PR events
- **THEN** the system provides webhook secret for signature verification
- **THEN** the system stores webhook ID in installation record
- **THEN** the system tests webhook delivery

### Requirement: OAuth Webhook Verification
The system SHALL verify webhook signatures for security.

#### Scenario: Receive GitHub webhook
- **WHEN** GitHub sends webhook payload
- **THEN** the system retrieves webhook secret from database
- **THEN** the system verifies HMAC signature using secret
- **THEN** the system processes webhook if signature valid
- **THEN** the system rejects webhook if signature invalid

#### Scenario: Receive Gitee webhook
- **WHEN** Gitee sends webhook payload
- **THEN** the system retrieves webhook secret from database
- **THEN** the system verifies HMAC signature using secret
- **THEN** the system processes webhook if signature valid
- **THEN** the system rejects webhook if signature invalid

#### Scenario: Receive GitLab webhook
- **WHEN** GitLab sends webhook payload
- **THEN** the system retrieves webhook token from database
- **THEN** the system verifies X-Gitlab-Token header
- **THEN** the system processes webhook if token matches
- **THEN** the system rejects webhook if token doesn't match

### Requirement: Single Admin OAuth Simplification
The system SHALL simplify OAuth for single admin use case.

#### Scenario: No user selection required
- **WHEN** admin authorizes OAuth app
- **THEN** the system does not prompt for user selection
- **THEN** the system assumes admin account for all operations
- **THEN** the system skips multi-user authorization steps

#### Scenario: Direct platform connection
- **WHEN** admin connects a platform (GitHub/Gitee/GitLab)
- **THEN** the system admin authorizes the platform directly
- **THEN** the system stores platform credentials for admin
- **THEN** the system admin has full access to connected platforms

### Requirement: OAuth Session Security
The system SHALL implement security measures for OAuth flows.

#### Scenario: Generate OAuth state parameter
- **WHEN** initiating OAuth authorization
- **THEN** the system generates cryptographically secure state parameter
- **THEN** the system stores state parameter in session
- **THEN** the system includes state in authorization URL

#### Scenario: Verify OAuth state parameter
- **WHEN** processing OAuth callback
- **THEN** the system retrieves state parameter from callback
- **THEN** the system compares with stored session state
- **THEN** the system rejects callback if states don't match
- **THEN** the system clears state from session after verification

#### Scenario: OAuth PKCE support (optional)
- **WHEN** platform supports PKCE (GitHub)
- **THEN** the system generates code verifier and challenge
- **THEN** the system includes code challenge in authorization request
- **THEN** the system includes code verifier in token exchange
