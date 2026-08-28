# Private workspace mapping

This public checkout keeps non-public architecture and strategy material in the private `private-workspace` repository. The local `private-docs` path is intentionally ignored by Git.

Clone the private workspace separately, then create the mapping from this project with one of the following commands:

```sh
./tools/link-private-workspace.sh /absolute/path/to/private-workspace
```

```powershell
.\tools\link-private-workspace.ps1 -PrivateWorkspaceRoot C:\path\to\private-workspace
```

The mapping exposes `projects/ai-chat-export-pro/private-docs` from the private workspace as this checkout's `private-docs` directory. Do not commit the generated directory link.
