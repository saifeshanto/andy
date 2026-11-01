-- CreateTable
CREATE TABLE `VoucherCampaign` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(24) NOT NULL,
    `merchantId` BIGINT NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `terms` TEXT NOT NULL,
    `benefitType` ENUM('FREE_ITEM', 'FIXED_OFF', 'PERCENT_OFF') NOT NULL,
    `benefitValue` INTEGER NULL,
    `memberOnly` BOOLEAN NOT NULL DEFAULT true,
    `totalQty` INTEGER NULL,
    `claimedCount` INTEGER NOT NULL DEFAULT 0,
    `perUserLimit` INTEGER NOT NULL DEFAULT 1,
    `claimStartAt` DATETIME(3) NULL,
    `claimEndAt` DATETIME(3) NOT NULL,
    `validUntil` DATETIME(3) NOT NULL,
    `validDays` INTEGER NULL,
    `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'ENDED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` BIGINT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(1000) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdById` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VoucherCampaign_publicId_key`(`publicId`),
    UNIQUE INDEX `VoucherCampaign_slug_key`(`slug`),
    INDEX `VoucherCampaign_status_claimEndAt_idx`(`status`, `claimEndAt`),
    INDEX `VoucherCampaign_merchantId_status_idx`(`merchantId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherCampaignOutlet` (
    `campaignId` BIGINT NOT NULL,
    `outletId` BIGINT NOT NULL,

    INDEX `VoucherCampaignOutlet_outletId_idx`(`outletId`),
    PRIMARY KEY (`campaignId`, `outletId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Voucher` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(16) NOT NULL,
    `campaignId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `status` ENUM('ACTIVE', 'REDEEMED', 'EXPIRED', 'VOID') NOT NULL DEFAULT 'ACTIVE',
    `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `redeemedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Voucher_code_key`(`code`),
    INDEX `Voucher_userId_status_idx`(`userId`, `status`),
    INDEX `Voucher_campaignId_userId_idx`(`campaignId`, `userId`),
    INDEX `Voucher_status_expiresAt_idx`(`status`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VoucherRedemption` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `voucherId` BIGINT NOT NULL,
    `merchantId` BIGINT NOT NULL,
    `merchantMemberId` BIGINT NOT NULL,
    `staffUserId` BIGINT NOT NULL,
    `outletId` BIGINT NOT NULL,
    `ip` VARCHAR(45) NULL,
    `userAgent` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reversedAt` DATETIME(3) NULL,
    `reversedById` BIGINT NULL,
    `reverseReason` VARCHAR(500) NULL,

    INDEX `VoucherRedemption_voucherId_idx`(`voucherId`),
    INDEX `VoucherRedemption_merchantId_createdAt_idx`(`merchantId`, `createdAt`),
    INDEX `VoucherRedemption_staffUserId_createdAt_idx`(`staffUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `VoucherCampaign` ADD CONSTRAINT `VoucherCampaign_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherCampaignOutlet` ADD CONSTRAINT `VoucherCampaignOutlet_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `VoucherCampaign`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherCampaignOutlet` ADD CONSTRAINT `VoucherCampaignOutlet_outletId_fkey` FOREIGN KEY (`outletId`) REFERENCES `MerchantOutlet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Voucher` ADD CONSTRAINT `Voucher_campaignId_fkey` FOREIGN KEY (`campaignId`) REFERENCES `VoucherCampaign`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VoucherRedemption` ADD CONSTRAINT `VoucherRedemption_voucherId_fkey` FOREIGN KEY (`voucherId`) REFERENCES `Voucher`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
