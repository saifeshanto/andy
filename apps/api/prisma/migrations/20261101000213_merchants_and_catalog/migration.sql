-- CreateTable
CREATE TABLE `StoredFile` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(32) NOT NULL,
    `ownerUserId` BIGINT NOT NULL,
    `purpose` ENUM('MERCHANT_DOCUMENT', 'MERCHANT_LOGO', 'MERCHANT_COVER', 'LISTING_IMAGE') NOT NULL,
    `visibility` ENUM('PUBLIC', 'PRIVATE') NOT NULL,
    `mime` VARCHAR(60) NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `sha256` CHAR(64) NOT NULL,
    `storageKey` VARCHAR(200) NOT NULL,
    `originalName` VARCHAR(200) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `StoredFile_publicId_key`(`publicId`),
    UNIQUE INDEX `StoredFile_storageKey_key`(`storageKey`),
    INDEX `StoredFile_ownerUserId_createdAt_idx`(`ownerUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Merchant` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(24) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `businessType` VARCHAR(80) NOT NULL,
    `ssmNo` VARCHAR(40) NOT NULL,
    `description` TEXT NULL,
    `phone` VARCHAR(32) NULL,
    `email` VARCHAR(191) NULL,
    `website` VARCHAR(255) NULL,
    `addressLine1` VARCHAR(200) NULL,
    `addressLine2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NULL,
    `state` VARCHAR(60) NULL,
    `postcode` VARCHAR(10) NULL,
    `logoFileId` BIGINT NULL,
    `coverFileId` BIGINT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'SUSPENDED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` BIGINT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(1000) NULL,
    `createdById` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Merchant_publicId_key`(`publicId`),
    UNIQUE INDEX `Merchant_slug_key`(`slug`),
    INDEX `Merchant_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `Merchant_createdById_idx`(`createdById`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchantMember` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `merchantId` BIGINT NOT NULL,
    `userId` BIGINT NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'CASHIER') NOT NULL,
    `outletId` BIGINT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `invitedById` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MerchantMember_userId_idx`(`userId`),
    UNIQUE INDEX `MerchantMember_merchantId_userId_key`(`merchantId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchantInvite` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `merchantId` BIGINT NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'MANAGER', 'CASHIER') NOT NULL,
    `outletId` BIGINT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `acceptedAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `invitedById` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MerchantInvite_tokenHash_key`(`tokenHash`),
    INDEX `MerchantInvite_merchantId_email_idx`(`merchantId`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchantOutlet` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `merchantId` BIGINT NOT NULL,
    `name` VARCHAR(150) NOT NULL,
    `addressLine1` VARCHAR(200) NOT NULL,
    `addressLine2` VARCHAR(200) NULL,
    `city` VARCHAR(100) NOT NULL,
    `state` VARCHAR(60) NOT NULL,
    `postcode` VARCHAR(10) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `hours` VARCHAR(500) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `MerchantOutlet_merchantId_idx`(`merchantId`),
    INDEX `MerchantOutlet_state_city_idx`(`state`, `city`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MerchantDocument` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `merchantId` BIGINT NOT NULL,
    `type` ENUM('SSM_CERTIFICATE', 'OWNER_IC', 'BANK_STATEMENT', 'OTHER') NOT NULL,
    `fileId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MerchantDocument_fileId_key`(`fileId`),
    INDEX `MerchantDocument_merchantId_idx`(`merchantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `parentId` INTEGER NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Listing` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `publicId` VARCHAR(24) NOT NULL,
    `merchantId` BIGINT NOT NULL,
    `categoryId` INTEGER NOT NULL,
    `type` ENUM('PRODUCT', 'SERVICE') NOT NULL,
    `slug` VARCHAR(160) NOT NULL,
    `title` VARCHAR(150) NOT NULL,
    `description` TEXT NOT NULL,
    `priceSen` INTEGER NOT NULL,
    `memberPriceSen` INTEGER NULL,
    `stockQty` INTEGER NULL,
    `durationMinutes` INTEGER NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED') NOT NULL DEFAULT 'DRAFT',
    `submittedAt` DATETIME(3) NULL,
    `reviewedById` BIGINT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(1000) NULL,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Listing_publicId_key`(`publicId`),
    UNIQUE INDEX `Listing_slug_key`(`slug`),
    INDEX `Listing_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `Listing_merchantId_status_idx`(`merchantId`, `status`),
    INDEX `Listing_categoryId_status_idx`(`categoryId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ListingImage` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `listingId` BIGINT NOT NULL,
    `fileId` BIGINT NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ListingImage_fileId_key`(`fileId`),
    INDEX `ListingImage_listingId_sort_idx`(`listingId`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ListingOutlet` (
    `listingId` BIGINT NOT NULL,
    `outletId` BIGINT NOT NULL,

    INDEX `ListingOutlet_outletId_idx`(`outletId`),
    PRIMARY KEY (`listingId`, `outletId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ListingRevision` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `listingId` BIGINT NOT NULL,
    `data` JSON NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `submittedById` BIGINT NOT NULL,
    `reviewedById` BIGINT NULL,
    `reviewedAt` DATETIME(3) NULL,
    `reviewNote` VARCHAR(1000) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ListingRevision_listingId_status_idx`(`listingId`, `status`),
    INDEX `ListingRevision_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MerchantMember` ADD CONSTRAINT `MerchantMember_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchantInvite` ADD CONSTRAINT `MerchantInvite_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchantOutlet` ADD CONSTRAINT `MerchantOutlet_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MerchantDocument` ADD CONSTRAINT `MerchantDocument_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Listing` ADD CONSTRAINT `Listing_merchantId_fkey` FOREIGN KEY (`merchantId`) REFERENCES `Merchant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Listing` ADD CONSTRAINT `Listing_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ListingImage` ADD CONSTRAINT `ListingImage_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `Listing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ListingOutlet` ADD CONSTRAINT `ListingOutlet_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `Listing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ListingOutlet` ADD CONSTRAINT `ListingOutlet_outletId_fkey` FOREIGN KEY (`outletId`) REFERENCES `MerchantOutlet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ListingRevision` ADD CONSTRAINT `ListingRevision_listingId_fkey` FOREIGN KEY (`listingId`) REFERENCES `Listing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
