ALTER TABLE "AiReview" ADD COLUMN "durationMs" INTEGER;
ALTER TABLE "AiReview" ADD COLUMN "operatorLabelsJson" TEXT;
ALTER TABLE "AiReview" ADD COLUMN "labeledAt" DATETIME;
ALTER TABLE "AiReview" ADD COLUMN "labelSource" TEXT;
