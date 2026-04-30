export type Role = 'worker' | 'admin' | 'visit' | 'support';
export type ClientStatus = 'available' | 'assigned' | 'interested' | 'thinking' | 'not_interested' | 'closed';
export type CreditStatus = 'pending' | 'approved' | 'rejected';
export type CreditAmount = 500 | 1000 | 1500;

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  commissionWallet: number;
  pendingCommissions: number;
  dni?: string;
  lastName?: string;
  firstName?: string;
  birthDate?: string;
  address?: string;
  phoneNumber?: string;
  whatsappNumber?: string;
  pin?: string;
  status: 'pending' | 'active' | 'suspended';
  createdAt: any;
}

export type QualificationStatus = 'potencial' | 'no_apto' | 'apto';

export interface ContactInfo {
  numero: string;
  whatsapp: 'SI' | 'NO';
}

export interface Client {
  id: string;
  dni: string;
  firstName: string;
  lastName: string;
  sex: 'M' | 'F';
  qualificationStatus?: QualificationStatus;
  laborData?: {
    company: string;
    laborStatus: 'contratado' | 'nombrado';
    modularCode: string;
    positionCode: string;
    startDate: string;
    endDate?: string;
  };
  financialData?: {
    totalDebt: number;
    monthlyInstallment: number;
    totalInstallments: number;
    paidInstallments: number;
    remainingInstallments: number;
    currentMonthPaid: boolean;
    previousCredits: number;
    paymentHistory: string;
    creditDate?: string;
    currentBalance?: number;
    discountedAmount?: number;
    overdueInstallments?: number;
    currentMonthAmount?: number;
    paymentLog?: { month: string; amount: number }[];
  };
  phones: {
    number: string;
    hasWhatsapp: boolean;
  }[];
  status: ClientStatus;
  assignedTo?: string;
  lockedAt?: any;
  updatedAt?: any;
}

export interface Interaction {
  id: string;
  clientId: string;
  workerId: string;
  type: 'call' | 'whatsapp';
  result: string;
  notes: string;
  createdAt: any;
}

export interface ExternalCredit {
  credit_num: number;
  fecha_credito: string;
  monto_credito: number;
  deuda: number;
}

export interface ExternalCreditDetail {
  credit_num: number;
  total_credits: number;
  dni: string;
  nombre: string;
  fecha_credito: string;
  monto_credito: number;
  deuda: number;
  monto_descontado: number;
  pagos_reg: number;
  cuotas_pendientes: number;
  cuotas_atrasadas: number;
  cuota_mensual_estimada: number;
  mes_actual: string;
  estado_mes_actual: string;
  timeline: {
    [month: string]: {
      amount: string | number;
      status: string;
    }
  };
}

export interface Credit {
  id: string;
  clientId: string;
  workerId: string;
  amount: CreditAmount;
  commission: number;
  status: CreditStatus;
  rejectionReason?: string;
  createdAt: any;
  approvedAt?: any;
  adminId?: string;
}

export interface Liquidation {
  id: string;
  userId: string;
  amount: number;
  paymentMethod: 'efectivo' | 'transferencia' | 'yapeo';
  note: string;
  createdAt: any;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: any;
}
