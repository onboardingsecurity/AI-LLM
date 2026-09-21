# 출처와 사용 허가 근거

## 글꼴
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| fonts/gamja-flower-400.woff2 | Gamja Flower (감자꽃) 400 굵기, 제작 YoonDesign Inc. Google Fonts(https://fonts.google.com/specimen/Gamja+Flower), 원본 파일은 https://github.com/google/fonts/tree/main/ofl/gamjaflower 의 GamjaFlower-Regular.ttf. 웹용 woff2로 형식만 바꿈(글자 모양은 그대로, 힌팅 제거. 방법은 tools/make_font.sh) | SIL Open Font License 1.1 (전문과 저작권 표기는 fonts/OFL.txt) |

## 시험용 이미지 (samples/test-inputs/)
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| valid-landscape.png, valid-portrait.jpg, valid-transparent.png | 본인 제작. tools/make_test_images.py가 Pillow로 직접 그린 합성 이미지 | 외부 저작물 없음. EXIF와 텍스트 메타데이터 없음 |
| unsupported.gif, fake-image.png, corrupt.png | 본인 제작. 같은 스크립트가 만든 잘못된 파일 시험용 자료 | 외부 저작물 없음 |

## 가져오기 시험용 JSON (samples/import-tests/)
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| valid.json, broken-syntax.json, missing-required.json | 본인 제작. 이 앱에서 직접 내보낸 템플릿(안의 이미지는 본인 제작 합성 이미지)으로 만든 시험 자료 | 외부 저작물 없음 |

## 서비스 페이지 배경 (assets/)
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| background.png | 본인 제작(AI 생성). 본인이 ChatGPT(gpt-image)로 직접 생성한 이미지. 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |

## 마우스 커서, 장식 이미지 (assets/)
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| mouse-cursor.png | 본인 제작(AI 생성). 본인이 ChatGPT로 직접 생성한 이미지. 파일에 생성 도구 정보나 위치 정보 같은 메타데이터는 없음 | OpenAI 이용약관 |
| left.png | 본인 제작(AI 생성). 본인이 ChatGPT로 직접 생성한 이미지. 파일에 생성 도구 정보나 위치 정보 같은 메타데이터는 없음 | OpenAI 이용약관 |
| right.png | 본인 제작(AI 생성). 본인이 ChatGPT(gpt-image)로 직접 생성한 이미지. 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |
| button/button-load-crop.png, button/button-delete-crop.png | 본인 제작(AI 생성). 본인이 ChatGPT로 직접 생성한 이미지(직접 만든 템플릿 목록의 불러오기, 삭제 버튼). 파일에 생성 도구 정보나 위치 정보 같은 메타데이터는 없음 | OpenAI 이용약관 |
| button/button-load.png, button/button-delete.png | 본인 제작(AI 생성). 본인이 ChatGPT(gpt-image)로 직접 생성한 이미지(현재 앱에서는 쓰지 않음). 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |
| templates/template-empty-image.png | 본인 제작(AI 생성). 본인이 ChatGPT(gpt-image)로 직접 생성한 이미지(직접 만든 템플릿이 없을 때 오른쪽 목록 자리에 보이는 그림). 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |
| templates/template-image1.png | 본인 제작(AI 생성). 본인이 ChatGPT로 직접 생성한 이미지(기본 템플릿 1의 배경). 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |
| templates/template-image2.png | 본인 제작(AI 생성). 본인이 ChatGPT로 직접 생성한 이미지(기본 템플릿 2의 배경). 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |
| templates/template-image3.png | 본인 제작(AI 생성). 본인이 ChatGPT로 직접 생성한 이미지(기본 템플릿 3의 배경). 원본 파일에 든 생성 정보(콘텐츠 자격 증명)는 제거하고 화소는 그대로 사용 | OpenAI 이용약관 |

## 카드 배경 (samples/backgrounds/)
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| bg-1x1.png, bg-4x5.png, bg-9x16.png | 본인 제작. tools/make_backgrounds.py가 Pillow로 그림(색 그라데이션 위에 분필 낙서 도형을 코드로 그림) | 외부 저작물 없음. EXIF와 텍스트 메타데이터 없음 |

## 완성 이미지 (samples/final/)
| 파일 | 출처 | 사용 허가 근거 |
|---|---|---|
| card-1x1.png | 본인 제작. 이 앱에서 배경 bg-1x1.png(본인 제작)에 문구 "오늘도 수고했어요"를 얹어 내려받음 | 외부 저작물 없음. 문구는 짧은 일반 문장(Claude가 제안). 글꼴은 Gamja Flower(SIL OFL 1.1) |
| card-4x5.png | 본인 제작. 이 앱에서 배경 bg-4x5.png(본인 제작)에 문구 "작은 성공을 모아 / 큰 하루를 만들어요"를 얹어 내려받음 | 외부 저작물 없음. 문구는 짧은 일반 문장(Claude가 제안). 글꼴은 Gamja Flower(SIL OFL 1.1) |
| card-9x16.png | 본인 제작. 이 앱에서 배경 bg-9x16.png(본인 제작)에 문구 "천천히 가도 괜찮아 / Keep going"을 얹어 내려받음 | 외부 저작물 없음. 문구는 짧은 일반 문장(Claude가 제안). 글꼴은 Gamja Flower(SIL OFL 1.1) |
