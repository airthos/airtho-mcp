# Before: Azure Functions Native MCP Binding (Current)

## Tool Call Flow

```mermaid
sequenceDiagram
    actor User as Any Claude.ai User
    participant C as Claude.ai
    participant AF as Azure Functions<br/>(MCP Binding)
    participant GC as Graph Client<br/>(Shared Singleton)
    participant E as Entra ID
    participant SP as SharePoint

    Note over C,SP: No per-user authentication — anyone with the connector URL gets access

    User->>C: "What files are in job Factorial?"
    C->>AF: MCP tool call: airtho_get_job<br/>(no Authorization header)
    AF->>AF: Extract args from triggerMetadata<br/>{ keyword: "factorial" }

    Note over AF,GC: HTTP headers (including any Bearer token)<br/>are stripped by the MCP binding — never reach handler code

    AF->>GC: getGraphClient()
    GC->>GC: Already initialized? Return cached client

    alt First call (cold start)
        GC->>E: Request token<br/>CLIENT_ID + CLIENT_SECRET
        E-->>GC: App-level access token<br/>(service account identity)
    end

    GC-->>AF: Shared Graph client<br/>(same for every user)
    AF->>SP: Graph API call<br/>running as: service account
    SP-->>AF: All files the service account can see<br/>(no user permission scoping)
    AF-->>C: Result
    C-->>User: Answer

    Note over User,SP: User B gets identical access to User A.<br/>SharePoint permissions are irrelevant — service account sees everything.
```

## What this means

- **Authentication:** None. The MCP endpoint is protected only by the Azure Functions system key in the URL.
- **Authorization:** The service account's SharePoint permissions apply to every user.
- **Audit trail:** No way to tell which Claude.ai user accessed what.
- **Per-user SharePoint permissions:** Not possible — Graph calls are always the service account.
- **Token flow:** One `ClientSecretCredential` singleton shared for the entire function worker lifetime.
