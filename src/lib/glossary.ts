/**
 * 재무/투자 용어 사전.
 *
 * CLAUDE.md UX 계층 4: 용어 클릭 시 정의 + 왜 중요 + 예시.
 * 본인이 재무 용어 모르므로 일상어 우선, 정확한 정의는 보조.
 */

export type Term = {
  /** 표시 이름 (영문 약어 + 한글) */
  name: string;
  /** 한글 풀이 */
  korean: string;
  /** 한 줄 일상어 정의 */
  oneLiner: string;
  /** 자세한 설명 */
  description: string;
  /** 왜 중요한가 */
  whyMatter: string;
  /** 예시 (수치 포함) */
  example?: string;
  /** Buffett 관련 노트 */
  buffett?: string;
};

export const GLOSSARY: Record<string, Term> = {
  // === 수익성 ===
  ROE: {
    name: "ROE",
    korean: "자기자본이익률",
    oneLiner: "주주 돈 100원으로 1년에 몇 원 벌었나",
    description: "Return on Equity = 순이익 ÷ 자본총계. 회사가 주주 자본을 얼마나 효율적으로 굴리는지 보여줍니다.",
    whyMatter: "Buffett이 가장 중시하는 단일 지표. 높을수록 자본을 잘 굴림. 한국 우량 기업 평균 ~10%.",
    example: "삼성전자 2024 ROE 9% = 주주 돈 100원당 9원 벌었음.",
    buffett: "ROE 15%+ 를 7년 이상 유지하는 기업이 진정한 경쟁우위를 가짐.",
  },
  ROA: {
    name: "ROA",
    korean: "총자산이익률",
    oneLiner: "회사 전체 자산으로 1년에 몇 원 벌었나",
    description: "Return on Assets = 순이익 ÷ 총자산. 부채까지 포함한 자산 효율성.",
    whyMatter: "ROE와 비교해서 보는 지표. ROE는 높은데 ROA는 낮으면 부채로 수익을 부풀린 케이스 가능.",
    example: "ROE 20%, ROA 5% → 부채 의존도 큼 (위험)",
  },
  영업이익률: {
    name: "영업이익률",
    korean: "Operating Margin",
    oneLiner: "매출 100원당 본업으로 몇 원 남기나",
    description: "영업이익 ÷ 매출. 본업 자체의 수익성. 비영업 손익 제외.",
    whyMatter: "꾸준히 높은 영업이익률 = 경쟁력(해자) 신호.",
    example: "삼성전자 2024 영업이익률 11% (반도체 회복기 평이).",
    buffett: "Buffett은 매출보다 마진을 봄. 마진 안 떨어지는 회사 = 가격 결정력 있음.",
  },
  순이익률: {
    name: "순이익률",
    korean: "Net Margin",
    oneLiner: "매출 100원당 최종으로 몇 원 남기나",
    description: "순이익 ÷ 매출. 세금/이자/일회성까지 다 빼고 남는 돈.",
    whyMatter: "영업이익률과 차이가 크면 비영업 영향 큼.",
  },

  // === 밸류에이션 ===
  PER: {
    name: "PER",
    korean: "주가수익비율",
    oneLiner: "지금 가격으로 산다면 몇 년치 이익이 본전",
    description: "Price/Earnings Ratio = 주가 ÷ EPS = 시가총액 ÷ 순이익. 회사를 통째로 사면 몇 년이면 본전인가.",
    whyMatter: "낮을수록 쌈. 한국 평균 PER ~10. 단, 적자 회사는 PER 의미 없음.",
    example: "PER 8 = 8년치 이익이면 회사 가격만큼 회수.",
    buffett: "Buffett 본인은 PER 절대값보다 ROE/성장 종합 평가. 다만 PER 30+ 회사는 거의 안 삼.",
  },
  PBR: {
    name: "PBR",
    korean: "주가순자산비율",
    oneLiner: "회사 자산의 몇 배 가격에 거래되나",
    description: "Price/Book Ratio = 주가 ÷ BPS = 시가총액 ÷ 자본총계. 청산가치 대비 거래가.",
    whyMatter: "PBR < 1 = 회사 자산보다 싸게 거래 (잠재 저평가).",
    example: "PBR 0.7 = 회사 자산의 70% 가격에 거래.",
    buffett: "Graham(버핏 스승)이 강조. PBR 1.5 이하 + 우량 재무 = Graham 매수 기준.",
  },
  PSR: {
    name: "PSR",
    korean: "주가매출비율",
    oneLiner: "매출의 몇 배 가격에 거래되나",
    description: "Price/Sales Ratio = 시가총액 ÷ 매출. 적자 회사도 평가 가능.",
    whyMatter: "성장주(아직 적자) 평가에 유용. 1 이하 = 보수적, 5+ = 고평가.",
  },
  PEG: {
    name: "PEG",
    korean: "주가수익성장비율",
    oneLiner: "성장률 대비 PER이 비싼가",
    description: "PER ÷ 성장률(%). 1 이하 = 성장 대비 저평가.",
    whyMatter: "단순 PER만으로는 성장주 평가 불가. PEG가 보완.",
    example: "PER 20 + 성장률 25% → PEG 0.8 (성장 대비 저평가)",
  },
  EPS: {
    name: "EPS",
    korean: "주당순이익",
    oneLiner: "주식 1주가 1년에 얼마 벌었나",
    description: "순이익 ÷ 발행주식수. 주가의 핵심 펀더멘털.",
    whyMatter: "EPS 꾸준히 증가 = 좋은 회사. 주가는 결국 EPS 따라감 (장기).",
    example: "삼성전자 2024 EPS 4,950원.",
  },
  BPS: {
    name: "BPS",
    korean: "주당순자산",
    oneLiner: "주식 1주가 가진 회사 자산 가치",
    description: "자본총계 ÷ 발행주식수. 회사 청산 시 1주가 받는 몫.",
    whyMatter: "PBR 계산의 분모. PBR < 1 = 주가가 BPS 미만.",
  },
  EBITDA: {
    name: "EBITDA",
    korean: "법인세·이자·감가상각 전 이익",
    oneLiner: "현금 베이스 영업 결과",
    description: "Earnings Before Interest, Tax, Depreciation, Amortization. 영업이익 + 감가상각비.",
    whyMatter: "감가상각의 회계 처리 차이를 제거 → 회사 간 비교 용이. M&A 평가에 흔히 사용.",
  },
  EBIT: {
    name: "EBIT",
    korean: "이자·세금 전 이익",
    oneLiner: "영업이익 + 비영업이익 ≈ 영업이익",
    description: "Earnings Before Interest and Tax. 한국 회계 기준 영업이익과 거의 같음.",
    whyMatter: "EV/EBIT 등 밸류에이션 지표에 사용.",
  },

  // === 안전성 / 부채 ===
  부채비율: {
    name: "부채비율",
    korean: "Debt-to-Equity",
    oneLiner: "자본 100원당 부채가 몇 원",
    description: "총부채 ÷ 자본총계 × 100. 회사가 빚으로 운영하는 정도.",
    whyMatter: "낮을수록 안전. Buffett은 200% 넘는 회사 거의 안 삼. 50% 이하면 보수적.",
    example: "부채비율 50% = 자본 100원에 빚 50원.",
  },
  유동비율: {
    name: "유동비율",
    korean: "Current Ratio",
    oneLiner: "1년 안에 갚을 빚을 1년 안에 받을 돈으로 갚을 수 있나",
    description: "유동자산 ÷ 유동부채. 단기 지급능력.",
    whyMatter: "1.5 이상 = 안전. 1 미만 = 단기 위험.",
  },

  // === 현금흐름 / Owner Earnings ===
  FCF: {
    name: "FCF",
    korean: "잉여현금흐름",
    oneLiner: "회사가 자유롭게 쓸 수 있는 현금",
    description: "Free Cash Flow = 영업현금흐름 − CapEx. 배당/자사주매입/투자에 쓸 수 있는 진짜 현금.",
    whyMatter: "회계 이익보다 정직한 지표. FCF 꾸준히 양수 = 지속 가능 비즈니스.",
    buffett: "Buffett은 회계 이익보다 FCF 본다. Owner Earnings의 핵심.",
  },
  OCF: {
    name: "OCF",
    korean: "영업현금흐름",
    oneLiner: "본업으로 들어오는 현금",
    description: "Operating Cash Flow. 순이익 + 감가상각 ± 운전자본 변화.",
    whyMatter: "OCF가 순이익보다 작으면 매출채권/재고가 쌓이는 중 (현금화 부진).",
  },
  CapEx: {
    name: "CapEx",
    korean: "자본적 지출",
    oneLiner: "공장/설비 투자 비용",
    description: "Capital Expenditure. 유형자산/무형자산 취득에 쓴 현금.",
    whyMatter: "CapEx 큼 = 투자 활발 (성장) 또는 자본집약 (저수익). 업종별 비교 필요.",
  },
  OwnerEarnings: {
    name: "Owner Earnings",
    korean: "주인 수익",
    oneLiner: "주인이 가져갈 수 있는 진짜 이익",
    description: "Buffett 정의: 순이익 + 감가상각 − 유지CapEx. 단순화: OCF − CapEx (= FCF).",
    whyMatter: "회계 이익은 조작 여지 많음. OE는 현금 기반이라 정직.",
    buffett: "Buffett 본인이 1986년 주주서한에서 정의. '진짜 회사 가치'의 표준.",
  },

  // === 성장 ===
  CAGR: {
    name: "CAGR",
    korean: "연복리 성장률",
    oneLiner: "매년 평균 몇 % 성장했나",
    description: "Compound Annual Growth Rate. (마지막값/첫값)^(1/년수) − 1.",
    whyMatter: "단순 평균보다 정확한 장기 성장률. 5년 CAGR 5%+ = 안정 성장.",
    example: "5년 매출 100→160조 → CAGR 9.9%",
  },
  YoY: {
    name: "YoY",
    korean: "전년 동기 대비",
    oneLiner: "작년 같은 시기 대비 변화",
    description: "Year-over-Year. 분기/월 데이터의 계절성 제거.",
    whyMatter: "QoQ보다 노이즈 적음. 비즈니스 추세 보는 표준.",
  },

  // === 가치투자 핵심 ===
  안전마진: {
    name: "안전마진",
    korean: "Margin of Safety",
    oneLiner: "적정가 대비 얼마나 싸게 사는가",
    description: "(내재가치 − 현재가) ÷ 내재가치. 평가 오류에 대한 완충재.",
    whyMatter: "Graham/Buffett 가치투자의 핵심. 안전마진 30%+ = 매수 기준선.",
    example: "내재가치 10,000 + 현재가 7,000 → 안전마진 30%",
    buffett: "'다리 무게 1만톤이면 9천톤 트럭 통과시키면 안 됨' — Buffett의 비유.",
  },
  내재가치: {
    name: "내재가치",
    korean: "Intrinsic Value",
    oneLiner: "회사가 진짜로 가치 있는 돈",
    description: "회사가 향후 벌어들일 모든 현금을 현재 가치로 할인한 합계. DCF/Owner Earnings/Graham 등 여러 방법.",
    whyMatter: "현재가가 내재가치보다 낮을 때 매수. 단 내재가치 자체가 추정이라 안전마진 필요.",
    buffett: "'주식의 가격이 가치로 수렴하는 것이 시장의 단 한 가지 진실'.",
  },
  DCF: {
    name: "DCF",
    korean: "현금흐름할인법",
    oneLiner: "미래 현금을 오늘 가치로 할인한 합계",
    description: "Discounted Cash Flow. 향후 N년 FCF + terminal value를 WACC으로 할인.",
    whyMatter: "이론상 가장 정확한 내재가치. 단 가정(성장률/할인율)에 매우 민감.",
  },
  Graham: {
    name: "Graham 공식",
    korean: "Graham Number",
    oneLiner: "EPS와 BPS만으로 구한 보수적 적정가",
    description: "√(22.5 × EPS × BPS). Benjamin Graham 정통 공식.",
    whyMatter: "단순하고 보수적. PER 15 + PBR 1.5 = 22.5 (Graham 기준).",
    buffett: "Buffett 스승 Graham이 'Intelligent Investor'에서 제시.",
  },
  해자: {
    name: "해자",
    korean: "Economic Moat",
    oneLiner: "경쟁자가 못 따라잡는 구조적 우위",
    description: "브랜드, 네트워크 효과, 비용우위, 전환비용, 무형자산 등으로 만들어지는 진입장벽.",
    whyMatter: "Buffett이 가장 중시하는 정성적 지표. 해자 없는 회사는 ROE 유지 불가.",
    example: "코카콜라 = 브랜드 해자, 마이크로소프트 = 전환비용 해자.",
  },

  // === 기술적 지표 ===
  RSI: {
    name: "RSI",
    korean: "상대강도지수",
    oneLiner: "최근 14일 동안 얼마나 빨리 올랐나",
    description: "Relative Strength Index (14). 0~100, 70+ = 과열, 30 이하 = 침체.",
    whyMatter: "단기 진입 타이밍 필터. 가치 종목이라도 RSI 70+ 직후 매수는 단기 손실 위험.",
  },
  MA200: {
    name: "MA200",
    korean: "200일 이동평균선",
    oneLiner: "지난 200거래일 평균 가격",
    description: "최근 200거래일 종가의 단순 평균. 중장기 추세 지표.",
    whyMatter: "현재가 > MA200 = 상승 추세. < MA200 = 하락 추세 (catching falling knife 위험).",
  },
  "52주위치": {
    name: "52주 위치",
    korean: "52-week Position",
    oneLiner: "1년 내 최저~최고 사이 어디쯤",
    description: "(현재가 − 52주최저) ÷ (52주최고 − 52주최저). 0~100%.",
    whyMatter: "85%+ = 천장 가까움 (단기 매수 위험). 60~85% = 안전 구간.",
  },
};

export function getTerm(name: string): Term | undefined {
  return GLOSSARY[name];
}

export function listTerms(): Term[] {
  return Object.values(GLOSSARY);
}
