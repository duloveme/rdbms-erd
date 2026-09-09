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
  이미 맞춰 둔 버전 그대로 core와 designer를 npm에 public으로 publish합니다. 각 패키지의 `prepublishOnly`가 publish 직전에 빌드를 다시 돌립니다. **버전을 올리지 않고 테스트도 돌리지 않으므로**, 이미 배포된 버전 그대로 실행하면 실패합니다. 자세한 순서는 [npm 배포](#npm-배포)를 보세요.

- **`release:patch`** / **`release:minor`** / **`release:major`**  
  `release:check` → 해당 단계 version bump → core 의존 동기화 → `release:publish`까지 한 번에 실행하는 **실제 npm 배포용** end-to-end 스크립트입니다. 평소 배포는 이 스크립트를 쓰세요.

## npm 배포

배포 대상은 `@rdbms-erd/core`와 `@rdbms-erd/designer`입니다. 플레이그라운드(`apps/playground`)는 npm에 올리지 않습니다.

### 스크립트별 동작 비교

어떤 스크립트가 무엇까지 하는지 먼저 확인하세요. **`release:publish`는 버전을 올리지 않습니다.**

| 스크립트 | 테스트 | 버전 올림 | 빌드 | npm publish |
|---|---|---|---|---|
| `release:check` | O | X | O | X |
| `release:preflight:no-version` | O | X | O | X (pack dry-run) |
| `release:preflight` | O | **O (patch)** | O | X (pack dry-run) |
| `release:version:*` | X | O | X | X |
| `release:publish` | X | **X** | O (`prepublishOnly`) | O |
| `release:patch` / `:minor` / `:major` | O | O | O | O |

### 배포 순서

평소 배포는 아래 4단계를 그대로 따르면 됩니다.

#### 1. 사전 준비

```bash
npm login              # @rdbms-erd 스코프에 publish 권한 필요
npm whoami             # 로그인 계정 확인
git status             # 배포에 포함할 변경만 남아 있는지 확인
```

#### 2. 사전 점검 (버전을 건드리지 않음)

```bash
npm run release:preflight:no-version
```

빌드 · 테스트 · 플레이그라운드 빌드 · `npm pack --dry-run`까지 통과하는지 봅니다. 여기서 실패하면 배포로 넘어가지 마세요.

#### 3. 버전 올림 + 배포

변경 성격에 맞는 스크립트 **하나만** 실행합니다.

```bash
npm run release:patch    # 버그 수정·작은 변경 (0.1.37 → 0.1.38)
npm run release:minor    # 하위 호환 기능 추가 (0.1.37 → 0.2.0)
npm run release:major    # 호환이 깨지는 변경 (0.1.37 → 1.0.0)
```

내부 실행 순서는 다음과 같습니다.

1. `release:check` — 패키지 빌드 + 테스트
2. `release:version:*` — core·designer 버전 올림
3. `release:sync-core-dep` — designer의 `@rdbms-erd/core` 의존 버전을 core 새 버전에 맞춤
4. `release:publish` — core를 먼저 publish한 뒤 designer를 publish

#### 4. 마무리 (수동)

버전 스크립트는 `--no-git-tag-version`이라 **커밋도 태그도 만들지 않습니다.** 바뀐 `package.json` 두 개를 직접 커밋하세요.

```bash
npm view @rdbms-erd/core version        # 배포 결과 확인
npm view @rdbms-erd/designer version

git add packages/erd-core/package.json packages/erd-designer/package.json
git commit -m "chore: release v0.1.38"
git tag v0.1.38
git push && git push --tags
```

### 버전만 올리고 나중에 publish

버전을 올린 뒤 내용을 확인하고 나서 배포하고 싶을 때만 쓰세요.

```bash
npm run release:version:patch   # 또는 minor / major
# package.json 확인 후
npm run release:publish
```

### 주의사항

- **`release:publish`를 단독으로 실행하면 버전이 그대로**입니다. 이미 npm에 올라간 버전이면 `403 (cannot publish over existing version)`으로 실패합니다. 새 코드를 배포할 때는 `release:patch` 계열을 쓰세요.
- **core를 designer보다 먼저** publish합니다. `release:publish` / `release:patch` 등이 이미 그 순서를 지킵니다.
- designer는 같은 숫자의 `@rdbms-erd/core`를 dependency로 가집니다. version 스크립트가 `release:sync-core-dep`로 맞춥니다.
- `release:preflight`는 patch 버전을 **실제로 올린 뒤** 리허설합니다. 숫자를 바꾸고 싶지 않으면 `release:preflight:no-version`을 쓰세요.
- publish 직전에 각 패키지의 `prepublishOnly`가 `npm run build`를 다시 돌립니다. 그래서 `release:publish`만 실행해도 `dist/`는 최신입니다. 다만 **테스트는 돌지 않습니다.**

## License

- Open source: [MIT License](LICENSE)
- Commercial / enterprise: [LICENSING.md](LICENSING.md)
