## PR 워크플로우 — Claude × Gemini 자동 리뷰

PR을 생성할 때는 항상 아래 순서를 따른다. 사용자가 "PR 올려줘"라고 하면
별도 지시 없이 merge 완료까지 자율적으로 진행한다.

1. 코드 작성 및 `git commit`
2. `gh pr create` 로 PR 생성 → PR 번호 확인
3. `.github/scripts/cowork.sh <PR번호>` 실행
4. `cowork.sh`가 exit 2 (REQUEST_CHANGES)로 종료되면:
   - 출력된 Gemini 리뷰를 읽고 이슈를 코드에서 수정
   - `git push`
   - `cowork.sh <PR번호>` 다시 실행
5. Gemini가 APPROVE하면 GitHub Action이 자동 merge — 완료
6. 최대 5회 반복 후에도 merge 안 되면 사용자에게 상황 보고
