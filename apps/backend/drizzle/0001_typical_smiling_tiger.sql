CREATE TABLE `prices` (
	`id` text PRIMARY KEY NOT NULL,
	`asset` text NOT NULL,
	`price` text NOT NULL,
	`timestamp` integer NOT NULL,
	`block_number` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `prices_asset_time_idx` ON `prices` (`asset`,`timestamp`);