// 앱 전역 작업 모드 — 프로젝트 구조 자체를 두 갈래로 가른다.
//  · create : 내규를 올려 룰셋을 만든다 (룰셋이 아직 없으므로 RS API·그래프는 의미 없음)
//  · select : 룰셋 하나를 고른 뒤 그 룰셋으로 룰 편집·RS API·그래프를 본다
// 법령(관리·승인 큐)은 모드와 무관한 공통 영역이다.
import { createContext, useContext } from 'react';

export const WsContext = createContext(null);
export const useWs = () => useContext(WsContext);
