# 배포 가이드 (AWS EC2 올인원)

백엔드 + PostgreSQL(pgvector) + Redis + Caddy(HTTPS)를 EC2 한 대에 docker compose로 올린다.
프론트엔드(Next.js)는 Vercel에 따로 배포한다.

## 구성
```
EC2 (Ubuntu, t3.small 권장)
└─ docker compose -f docker-compose.prod.yml
   ├─ app       NestJS (마이그레이션 후 기동)
   ├─ postgres  pgvector/pg16
   ├─ redis     redis:7
   └─ caddy     80/443, 도메인 자동 HTTPS → app:3000
```

## 1. EC2 준비
- 리전: ap-northeast-2(서울) 권장
- 타입: t3.small (2GB). t3.micro(1GB)는 메모리 부족 위험
- OS: Ubuntu 24.04 LTS
- 스토리지: gp3 30GB
- 보안 그룹 인바운드: 22(SSH), 80(HTTP), 443(HTTPS)

## 2. 도메인 연결
- 도메인 구매 후 DNS A 레코드: `api.yourdomain.com` → EC2 퍼블릭 IP
- (Caddy가 인증서를 발급하려면 도메인이 서버 IP로 먼저 해석되어야 함)

## 3. 서버 세팅 (EC2 접속 후)
```bash
# Docker + compose 설치
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 재로그인 후 적용

# 코드 받기
git clone https://github.com/Myeongseok-Kang/jobroute.git
cd jobroute

# 환경변수 작성
cp .env.example .env
nano .env   # 값 채우기 (DOMAIN, JWT_SECRET, OPENAI/VOYAGE 키, 메일, OAuth 등)
```

## 4. 기동
```bash
docker compose -f docker-compose.prod.yml up -d --build
```
- app 컨테이너가 시작될 때 `prisma migrate deploy`로 스키마/pgvector 확장이 자동 적용된다
- Caddy가 `DOMAIN`에 대해 Let's Encrypt 인증서를 자동 발급한다 (1~2분 소요)

## 5. 확인
```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f app
curl https://api.yourdomain.com/   # Hello World! 나오면 정상
```

## 6. 프론트엔드 (Vercel)
- `jobroute-web`를 Vercel에 배포
- API 베이스를 `https://api.yourdomain.com`로 설정 (rewrite/프록시 대상)
- `FRONTEND_URL`(백엔드 .env)을 Vercel 주소로 맞추고, OAuth 콜백 URL도 일치시킬 것

## 운영 명령
```bash
# 코드 업데이트 반영
git pull && docker compose -f docker-compose.prod.yml up -d --build

# 로그
docker compose -f docker-compose.prod.yml logs -f app

# 전체 내리기 (데이터 볼륨은 보존)
docker compose -f docker-compose.prod.yml down

# 체험 종료 후 완전 삭제 (DB 데이터까지)
docker compose -f docker-compose.prod.yml down -v
```

## 비용/안전 메모
- 한 달 체험 후 EC2 인스턴스를 **terminate**하면 과금이 멈춘다
- OpenAI 대시보드에서 **월 사용 한도(usage limit)** 를 걸어 폭주를 방지할 것
- `.env`는 절대 커밋하지 말 것 (`.gitignore`에 이미 제외됨)

## 로컬 검증 (선택)
도메인 없이 빌드/기동만 확인하려면 `.env`의 `DOMAIN=localhost`로 두고:
```bash
docker compose -f docker-compose.prod.yml up --build
# 브라우저 https://localhost (Caddy 내부 인증서, 경고 무시) 또는 app 로그 확인
```
