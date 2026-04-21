# rdbms-erd

Monorepo for ERD tooling:
- `@rdbms-erd/core`: model + validation + DDL
- `@rdbms-erd/designer`: React ERD designer UI
- `apps/playground`: integration/reference app

## Package Docs (npm-oriented)

- [`packages/erd-core/README.md`](packages/erd-core/README.md)
  - core types and APIs
  - JSON dialect metadata (`hostMetas`)
  - optional DDL function hooks (`hostDdlGenerators`)
- [`packages/erd-designer/README.md`](packages/erd-designer/README.md)
  - `ERDDesigner` usage and props
  - host DB metadata injection and DDL hook wiring
  - i18n/toolbar/ref integration

## Additional Reference Docs

- [`docs/API.md`](docs/API.md)
- [`docs/COMPONENT_PROPS.md`](docs/COMPONENT_PROPS.md)

## Development

```bash
npm install
npm run dev
npm test
npm run build
```

## License

- Open source: [MIT License](LICENSE)
- Commercial / enterprise: [LICENSING.md](LICENSING.md)
