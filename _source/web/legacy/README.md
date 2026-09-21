# 기존 SVG 지도 보관

`index.html`은 카카오 전환 직전의 로컬 기존 지도 원본입니다. 삭제하지 않고
이 폴더에 보존하며, `scripts/build-kakao.mjs`가 공통 분석 UI·계산식을 읽는 기준으로 사용합니다.

이 폴더는 로컬 공개 디렉터리 `dist/` 밖에 있습니다. GitHub Pages에서도
`_config.yml`의 `exclude`로 배포하지 않습니다. 공개 홈페이지와 `kakao.html`은
모두 카카오 렌더러만 사용하며 기존 지도로 연결되는 링크는 없습니다.

`github-before-kakao.html`이 함께 있다면 GitHub Pages 전환 직전 공개 페이지의 별도 보관본입니다.
