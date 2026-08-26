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

## Scripts

루트 [`package.json`](package.json)에 정의된 npm 스크립트입니다. 자주 쓰는 **일상 개발**과 npm에 올리는 **배포·버전**으로 나눴습니다.

### 일상 개발

- **`dev`**  
  플레이그라운드(Next.js) 개발 서버를 켭니다. 브라우저에서 ERD UI를 바로 만져보며 확인할 때 사용합니다.

- **`build:packages`**  
  `@rdbms-erd/core`를 먼저 빌드한 뒤 `@rdbms-erd/designer`를 빌드합니다. `dist/`를 갱신하므로, npm 배포 전이나 다른 프로젝트에서 `file:` 경로로 패키지를 붙여 로컬 테스트할 때 실행합니다.

- **`build`**  
  위 패키지 빌드 후 플레이그라운드 프로덕션 빌드까지 한 번에 돌립니다. 모노레포 전체가 깨지지 않는지 확인할 때 사용합니다.

- **`lint`**  
  플레이그라운드 앱의 lint를 실행합니다.

- **`test`**  
  루트에서 Vitest로 패키지 단위 테스트를 한 번 실행합니다(`vitest run`). 감시 모드가 아니라 한 번 돌고 끝납니다.

- **`prepare`**  
  `npm install`이 끝난 뒤 자동으로 `build:packages`를 실행합니다. 저장소를 클론한 직후 플레이그라운드가 최신 `dist`를 쓰게 하려는 용도입니다. 평소에 수동으로 자주 실행할 필요는 없습니다.

### 배포·버전 (npm)

- **`release:check`**  
  패키지를 빌드하고 테스트를 돌립니다. 버전을 올리거나 publish하기 전에 “빌드와 테스트가 통과하는지”만 보고 싶을 때 사용합니다. npm에는 올리지 않습니다.

- **`release:preflight`**  
  배포 리허설입니다. `release:check` 후 **patch 버전을 실제로 올리고**, designer가 가리키는 `@rdbms-erd/core` 버전을 맞춘 다음 `npm install`·재검증·플레이그라운드 빌드·`npm pack` dry-run까지 진행합니다.  
  **주의:** 로컬 `package.json`의 버전 숫자가 바뀝니다. 버전은 건드리지 않고 점검만 하려면 아래 `release:preflight:no-version`을 쓰세요.

- **`release:preflight:no-version`**  
  버전은 그대로 두고, 빌드·테스트·플레이그라운드 빌드·pack dry-run만 수행하는 안전한 사전점검입니다. “올릴 수 있는 상태인지” 확인할 때 적합합니다.

- **`release:version:patch`** / **`release:version:minor`** / **`release:version:major`**  
  `erd-core`와 `erd-designer`의 `version`을 각각 patch / minor / major로 올립니다. git 태그는 만들지 않습니다(`--no-git-tag-version`). 이어서 designer의 `@rdbms-erd/core` dependency 문자열을 core 버전과 같게 맞춥니다. **npm publish는 하지 않습니다.**

- **`release:sync-core-dep`**  
  designer `package.json`의 `@rdbms-erd/core` 의존 버전만 core의 현재 `version`으로 덮어씁니다. version 스크립트 안에서도 호출됩니다. 따로 맞출 일이 있을 때만 직접 실행하면 됩니다.

- **`release:publish`**  
  이미 맞춰 둔 버전 그대로 core와 designer를 npm에 public으로 publish합니다. 패키지의 `prepublishOnly`로 빌드가 한 번 더 돌아갈 수 있습니다.

- **`release:patch`** / **`release:minor`** / **`release:major`**  
  `release:check` → 해당 단계 version bump → core 의존 동기화 → `release:publish`까지 한 번에 실행하는 **실제 npm 배포용** end-to-end 스크립트입니다.

## npm 배포

배포 대상은 `@rdbms-erd/core`와 `@rdbms-erd/designer`입니다. 플레이그라운드(`apps/playground`)는 npm에 올리지 않습니다.

### 사전 준비

1. [npm](https://www.npmjs.com/)에 로그인할 수 있어야 합니다 (`npm login`). 패키지 스코프 `@rdbms-erd`에 publish 권한이 있어야 합니다.
2. 작업 트리가 깨끗한지(또는 배포에 포함할 변경만 있는지) 확인합니다.
3. 배포 전에 한 번 점검합니다.

```bash
# 버전은 올리지 않고 빌드·테스트·pack만 확인 (권장)
npm run release:preflight:no-version
```

### 한 번에 배포 (권장)

변경 성격에 맞는 스크립트 하나만 실행하면 됩니다.

```bash
# 버그 수정·작은 변경 → 0.1.x patch
npm run release:patch

# 하위 호환 API/기능 추가 → minor
npm run release:minor

# 호환이 깨지는 변경 → major
npm run release:major
```

각 스크립트가 하는 일:

1. `release:check` — 패키지 빌드 + 테스트  
2. `release:version:*` — core·designer 버전 올림 + designer의 `@rdbms-erd/core` 의존 버전 맞춤  
3. `release:publish` — core를 먼저 public publish한 뒤 designer를 publish  

성공하면 npm에 새 버전이 올라갑니다. 로컬 `packages/*/package.json` 버전과 designer의 core dependency도 바뀌어 있으므로, 그 변경을 git에 커밋하는 것을 권장합니다. (스크립트는 git 태그를 자동으로 만들지 않습니다.)

### 버전만 올리고 나중에 publish

```bash
npm run release:version:patch   # 또는 minor / major
# 내용 확인 후
npm run release:publish
```

### 주의사항

- **core를 designer보다 먼저** 올립니다. `release:publish` / `release:patch` 등이 이미 그 순서를 지킵니다.
- designer는 같은 숫자의 `@rdbms-erd/core`를 dependency로 가집니다. version 스크립트가 `release:sync-core-dep`로 맞춥니다.
- `release:preflight`는 patch 버전을 **실제로 올린 뒤** 리허설합니다. 숫자만 시험하고 싶지 않으면 `release:preflight:no-version`을 쓰세요.
- publish 직전에 각 패키지의 `prepublishOnly`로 빌드가 한 번 더 돌 수 있습니다.

## License

- Open source: [MIT License](LICENSE)
- Commercial / enterprise: [LICENSING.md](LICENSING.md)
