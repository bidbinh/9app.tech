-- Phần cước 9Ship đã chịu thay khách (vượt trần niêm yết hoặc ví hết hạn mức). Khi cước giảm lại, hoàn cho 9Ship trước.
ALTER TABLE shipments ADD COLUMN absorbed bigint NOT NULL DEFAULT 0;
