-- CreateTable
CREATE TABLE `MembershipPlan` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(40) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `priceSen` INTEGER NOT NULL,
    `durationMonths` INTEGER NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `MembershipPlan_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Membership` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `userId` BIGINT NOT NULL,
    `planId` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED') NOT NULL,
    `startAt` DATETIME(3) NOT NULL,
    `endAt` DATETIME(3) NOT NULL,
    `sourceOrderId` BIGINT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Membership_sourceOrderId_key`(`sourceOrderId`),
    INDEX `Membership_userId_status_idx`(`userId`, `status`),
    INDEX `Membership_status_endAt_idx`(`status`, `endAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MembershipEvent` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `membershipId` BIGINT NOT NULL,
    `type` ENUM('ACTIVATED', 'RENEWED', 'EXPIRED', 'CANCELLED', 'REFUNDED', 'EXTENDED_BY_ADMIN') NOT NULL,
    `actorId` BIGINT NULL,
    `note` VARCHAR(500) NULL,
    `data` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MembershipEvent_membershipId_idx`(`membershipId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `publicNo` VARCHAR(24) NOT NULL,
    `userId` BIGINT NOT NULL,
    `type` ENUM('MEMBERSHIP', 'MARKETPLACE') NOT NULL,
    `status` ENUM('PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED', 'REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `subtotalSen` INTEGER NOT NULL,
    `discountSen` INTEGER NOT NULL DEFAULT 0,
    `taxSen` INTEGER NOT NULL DEFAULT 0,
    `totalSen` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'MYR',
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Order_publicNo_key`(`publicNo`),
    INDEX `Order_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `Order_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `orderId` BIGINT NOT NULL,
    `itemType` ENUM('MEMBERSHIP', 'LISTING', 'VOUCHER') NOT NULL,
    `refId` VARCHAR(40) NOT NULL,
    `titleSnapshot` VARCHAR(200) NOT NULL,
    `unitPriceSen` INTEGER NOT NULL,
    `qty` INTEGER NOT NULL,
    `lineTotalSen` INTEGER NOT NULL,

    INDEX `OrderItem_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `orderId` BIGINT NOT NULL,
    `provider` VARCHAR(30) NOT NULL,
    `providerRef` VARCHAR(100) NULL,
    `amountSen` INTEGER NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'MYR',
    `status` ENUM('CREATED', 'PENDING', 'PAID', 'FAILED', 'EXPIRED', 'REFUNDED') NOT NULL DEFAULT 'CREATED',
    `checkoutUrl` VARCHAR(500) NULL,
    `paidAt` DATETIME(3) NULL,
    `failureCode` VARCHAR(100) NULL,
    `raw` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payment_orderId_idx`(`orderId`),
    INDEX `Payment_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `Payment_provider_providerRef_key`(`provider`, `providerRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentWebhookLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `provider` VARCHAR(30) NOT NULL,
    `providerRef` VARCHAR(100) NULL,
    `signatureValid` BOOLEAN NOT NULL,
    `payload` JSON NOT NULL,
    `processedAt` DATETIME(3) NULL,
    `error` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PaymentWebhookLog_provider_providerRef_idx`(`provider`, `providerRef`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MembershipReminder` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `membershipId` BIGINT NOT NULL,
    `offsetDays` INTEGER NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `MembershipReminder_membershipId_offsetDays_key`(`membershipId`, `offsetDays`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Membership` ADD CONSTRAINT `Membership_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `MembershipPlan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipEvent` ADD CONSTRAINT `MembershipEvent_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MembershipReminder` ADD CONSTRAINT `MembershipReminder_membershipId_fkey` FOREIGN KEY (`membershipId`) REFERENCES `Membership`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
