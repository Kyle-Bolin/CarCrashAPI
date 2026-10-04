DROP INDEX "crashes_start_time_idx";--> statement-breakpoint
CREATE INDEX "crashes_start_time_id_idx" ON "crashes" USING btree ("start_time" DESC NULLS LAST,"id");