## ADDED Requirements

### Requirement: Apply GitHub Dark Theme Colors
The landing page SHALL use color tokens derived from GitHub's dark mode (dimmed or high contrast) to ensure visual consistency with the desired aesthetic.
- Background: `#0d1117` (canvas-default)
- Card Background: `#161b22` (canvas-subtle)
- Border Color: `#30363d` (border-default)
- Text Color: `#c9d1d9` (fg-default)
- Muted Text Color: `#8b949e` (fg-muted)

#### Scenario: Verify Background Colors
- **WHEN** the landing page is loaded
- **THEN** the main background color is `#0d1117`
- **AND** card backgrounds are `#161b22`

#### Scenario: Verify Border Colors
- **WHEN** viewing cards or sections with borders
- **THEN** the border color is `#30363d`

### Requirement: Use System Fonts
The landing page typography SHALL use the system font stack to mimic GitHub's native feel.

#### Scenario: Font Family Check
- **WHEN** inspecting text elements
- **THEN** the font-family stack includes `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Helvetica`, `Arial`, `sans-serif`

### Requirement: Component Styling
Interactive elements SHALL match GitHub's button and link styles.

#### Scenario: Primary Button Style
- **WHEN** viewing the "Enter Dashboard" button (if authenticated)
- **THEN** the button background is `#238636` (success-emphasis)
- **AND** the text color is `#ffffff`

#### Scenario: Secondary Button Style
- **WHEN** viewing secondary actions or links
- **THEN** they use the muted text color `#8b949e` or standard link color `#58a6ff`
