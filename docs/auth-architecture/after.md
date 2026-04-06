# After: Express + MCP SDK with OAuth 2.1 + OBO (Proposed)

## First-Time Setup Flow (Once Per User)

```mermaid
sequenceDiagram
    actor User as Airtho Employee
    participant C as Claude.ai
    participant EX as Express Server<br/>(our MCP server)
    participant E as Entra ID<br/>(Microsoft Login)

    Note over User,E: One-time setup in Claude.ai Settings → Connectors

    User->>C: Add connector URL
    C->>EX: GET /.well-known/oauth-protected-resource
    EX-->>C: Protected Resource Metadata<br/>{ authorization_servers: [Entra ID],<br/>  scopes: ["Sites.Read.All", "Files.Read.All"] }

    C->>C: Detect OAuth required<br/>Show "Authorize" button to user
    User->>C: Click "Authorize"

    C->>E: Redirect to Microsoft login<br/>(authorization code + PKCE)
    User->>E: Sign in with Airtho Microsoft account
    E-->>C: Authorization code
    C->>E: Exchange code → access token<br/>(PKCE code verifier)
    E-->>C: Bearer token<br/>(audience: our MCP server,<br/> identity: user@airtho.com)

    C->>C: Store token for this connector
    Note over User,E: Setup complete. Claude.ai now sends this token on every MCP request.
```

## Tool Call Flow (After Auth Setup)

```mermaid
sequenceDiagram
    actor UserA as User A (Brendan)
    actor UserB as User B (Colleague)
    participant C as Claude.ai
    participant EX as Express Server<br/>+ JWT Middleware
    participant E as Entra ID
    participant G as Microsoft Graph API
    participant SP as SharePoint

    Note over UserA,SP: Both users call the same tool — they get different results

    UserA->>C: "What files are in job Factorial?"
    C->>EX: MCP tool call: airtho_get_job<br/>Authorization: Bearer <UserA token>

    EX->>EX: JWT middleware intercepts request
    EX->>E: Fetch JWKS (cached)<br/>Validate token signature + claims
    E-->>EX: Token valid<br/>user: brendan@airtho.com

    EX->>E: OBO token exchange<br/>user token → Graph token (as Brendan)
    E-->>EX: Graph access token<br/>(delegated — acts as Brendan)

    EX->>G: Graph API call<br/>running as: brendan@airtho.com
    G->>SP: Read files
    SP-->>G: Files Brendan can access<br/>(respects his SharePoint permissions)
    G-->>EX: Brendan's files
    EX-->>C: Result
    C-->>UserA: Answer (scoped to Brendan's permissions)

    Note over UserA,SP: Same tool call, different user

    UserB->>C: "What files are in job Factorial?"
    C->>EX: MCP tool call: airtho_get_job<br/>Authorization: Bearer <UserB token>
    EX->>EX: Validate + OBO exchange for UserB
    EX->>G: Graph API call<br/>running as: colleague@airtho.com
    G->>SP: Read files
    SP-->>G: Only files Colleague can access<br/>(may differ from Brendan's)
    G-->>EX: Colleague's files
    EX-->>C: Result (scoped to Colleague's permissions)
    C-->>UserB: Answer (may differ from Brendan's)
```

## What changes

- **Authentication:** Every Claude.ai user authenticates individually with their Microsoft account. One-time setup.
- **Authorization:** SharePoint permissions are fully respected per user.
- **Audit trail:** Graph API calls carry the user's identity — appear in Entra ID sign-in logs and SharePoint audit logs.
- **Per-user SharePoint permissions:** Fully enforced via OBO delegated token exchange.
- **Token flow:** Each request has its own Graph token tied to the requesting user.
