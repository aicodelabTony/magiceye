# Lessons Learned

## 2026-03-12
- React + Vite 환경 구축 시작.
- **애니메이션 버그 레슨**: React에서 `Date.now()`만 사용하면 컴포넌트 상태가 변하지 않아 리렌더링이 발생하지 않음. `requestAnimationFrame`과 연동된 상태(State) 업데이트를 통해 프레임별 리렌더링을 보장해야 함.

