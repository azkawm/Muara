CREATE TABLE `cursors` (
	`name` text PRIMARY KEY NOT NULL,
	`block` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `deliveries` (
	`guid` text PRIMARY KEY NOT NULL,
	`tx_hash` text NOT NULL,
	`asset` text NOT NULL,
	`recipient` text NOT NULL,
	`amount` text NOT NULL,
	`dst_eid` integer NOT NULL,
	`status` text NOT NULL,
	`dst_tx_hash` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `deliveries_tx_idx` ON `deliveries` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `deliveries_status_idx` ON `deliveries` (`status`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`block_number` integer NOT NULL,
	`tx_hash` text NOT NULL,
	`log_index` integer NOT NULL,
	`timestamp` integer NOT NULL,
	`source` text NOT NULL,
	`name` text NOT NULL,
	`account` text,
	`asset` text,
	`amount` text,
	`dst_eid` integer,
	`args` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_account_idx` ON `events` (`account`);--> statement-breakpoint
CREATE INDEX `events_tx_idx` ON `events` (`tx_hash`);--> statement-breakpoint
CREATE INDEX `events_name_idx` ON `events` (`name`);