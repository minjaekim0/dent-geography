# 치과 입지 지도

공개 사이트: https://minjaekim0.github.io/dent-geography/

기본 홈페이지와 `kakao.html`은 동일한 카카오 지도입니다. 인구 분포, 인구 증감,
2005·2010·2015·2020년 공식 주간인구 시계열을 포함합니다.

## 기존 지도 코드 보관

- `_source/web/legacy/index.html`: 카카오 전환 직전 로컬 SVG 지도와 공통 분석 기준 코드.
- `_source/web/legacy/github-before-kakao.html`: 전환 직전 공개 홈페이지 원본.
- `_source/web/scripts/`, `_source/web/tests/`: 빌드·검증 코드.

`_config.yml`에서 `_source`를 제외하므로 보관본은 저장소에서만 확인할 수 있고
GitHub Pages 페이지로는 제공되지 않습니다. `.nojekyll`을 추가하면 이 제외 규칙이
적용되지 않으므로 추가하지 마세요.

## 공개 화면 재생성

저장소 루트에서 `node _source/web/scripts/build-kakao.mjs --output-dir=.`를 실행합니다.
`--check`를 덧붙이면 보관된 분석 코드와 공개 결과물이 일치하는지 검사합니다.

전체 검증은 원자료를 보관한 개발 작업공간의 `web/tests/`에서 수행합니다.
이 배포 저장소에는 공개 집계 JSON만 포함하며 원자료 CSV/ZIP은 복사하지 않습니다.
원자료 확보·가공 설명은 `_source/web/POPULATION.md`를 참고하세요.

기존 `.github/workflows/collect-hira-specialties.yml`과 수집 CSV는 그대로 유지합니다.
루트의 기존 JSON도 과거 다운로드 링크 호환용으로 유지하며, 새 화면은 `data/`를 사용합니다.
