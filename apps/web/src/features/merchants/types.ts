export type MerchantStatus = 'DRAFT' | 'SUBMITTED' | 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type DocumentType = 'SSM_CERTIFICATE' | 'OWNER_IC' | 'BANK_STATEMENT' | 'OTHER';

export interface MerchantDocument {
  id: string;
  type: DocumentType;
  url: string;
  name: string;
  mime: string;
  sizeBytes: number;
  createdAt: string;
}

export interface MerchantView {
  id: string;
  slug: string | null;
  name: string;
  businessType: string;
  ssmNo: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  logo: { id: string; url: string } | null;
  status: MerchantStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  documents?: MerchantDocument[];
  missing?: string[];
}

export const merchantStatusLabel: Record<MerchantStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Under review',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  REJECTED: 'Not approved',
  SUSPENDED: 'Suspended',
};
export const merchantStatusTone: Record<MerchantStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  SUBMITTED: 'warning',
  CHANGES_REQUESTED: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
};
export const documentLabel: Record<DocumentType, string> = {
  SSM_CERTIFICATE: 'SSM certificate',
  OWNER_IC: "Owner's IC",
  BANK_STATEMENT: 'Bank statement',
  OTHER: 'Other document',
};

export const MY_STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Kuala Lumpur', 'Labuan', 'Putrajaya',
] as const;
