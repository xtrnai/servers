## Architecture Decisions
- Single index.ts file for all 6 tools (user preference)
- Env-only server (no userConfig, no OAuth)
- Raw fetch() for all Google API calls (CF Workers constraint)
- No helper functions — each handler is self-contained
- Hardcoded field masks per tool (prevents billing surprises)
- No language/region/units params — English defaults only
