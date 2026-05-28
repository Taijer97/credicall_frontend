import { collection, addDoc, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { type Client } from '../types';

const SAMPLE_CLIENTS: Omit<Client, 'id'>[] = [
  {
    dni: '12345678',
    firstName: 'Juan',
    lastName: 'Pérez',
    sex: 'M',
    status: 'available',
    qualificationStatus: 'no_apto',
    phones: [
      { number: '987654321', hasWhatsapp: true },
      { number: '912345678', hasWhatsapp: false }
    ],
    laborData: {
      company: 'Ministerio de Educación',
      laborStatus: 'nombrado',
      modularCode: 'MOD-101',
      positionCode: 'CAR-01',
      startDate: '2015-03-01'
    },
    financialData: {
      totalDebt: 3600,
      monthlyInstallment: 300,
      totalInstallments: 12,
      paidInstallments: 2,
      remainingInstallments: 10,
      currentMonthPaid: true,
      previousCredits: 1,
      paymentHistory: 'Observado',
      creditDate: '01/02/2026',
      currentBalance: 3000,
      discountedAmount: 600,
      overdueInstallments: 1,
      currentMonthAmount: 0,
      paymentLog: [
        { month: '02/2026', amount: 300 },
        { month: '03/2026', amount: 300 }
      ]
    }
  },
  {
    dni: '00150150',
    firstName: 'ANTON SANTIAGO',
    lastName: 'OSWALDO',
    sex: 'M',
    status: 'available',
    qualificationStatus: 'apto',
    phones: [
      { number: '987654321', hasWhatsapp: true }
    ],
    laborData: {
      company: 'PODER JUDICIAL',
      laborStatus: 'nombrado',
      modularCode: 'PJ-001',
      positionCode: 'SEC-01',
      startDate: '2010-01-01'
    },
    financialData: {
      totalDebt: 8421.98,
      monthlyInstallment: 701.83,
      totalInstallments: 12,
      paidInstallments: 4,
      remainingInstallments: 8,
      currentMonthPaid: true,
      previousCredits: 1,
      paymentHistory: 'Excelente',
      creditDate: '11/11/2025',
      currentBalance: 5614.66,
      discountedAmount: 2807.32,
      overdueInstallments: 0,
      currentMonthAmount: 701.83,
      paymentLog: [
        { month: '12/2025', amount: 701.83 },
        { month: '01/2026', amount: 701.83 },
        { month: '02/2026', amount: 701.83 },
        { month: '03/2026', amount: 701.83 },
        { month: '04/2026', amount: 701.83 }
      ]
    }
  },
  {
    dni: '87654321',
    firstName: 'Maria',
    lastName: 'García',
    sex: 'F',
    status: 'available',
    qualificationStatus: 'no_apto',
    phones: [
      { number: '955443322', hasWhatsapp: true }
    ],
    laborData: {
      company: 'Essalud',
      laborStatus: 'contratado',
      modularCode: 'MOD-202',
      positionCode: 'CAR-02',
      startDate: '2020-01-15'
    },
    financialData: {
      totalDebt: 5000,
      monthlyInstallment: 500,
      totalInstallments: 10,
      paidInstallments: 1,
      remainingInstallments: 9,
      currentMonthPaid: false,
      previousCredits: 1,
      paymentHistory: 'Retraso'
    }
  },
  {
    dni: '45456767',
    firstName: 'Carlos',
    lastName: 'Sánchez',
    sex: 'M',
    status: 'available',
    qualificationStatus: 'potencial',
    phones: [
      { number: '966778899', hasWhatsapp: true }
    ],
    laborData: {
      company: 'Poder Judicial',
      laborStatus: 'nombrado',
      modularCode: 'MOD-303',
      positionCode: 'CAR-03',
      startDate: '2018-06-20'
    }
  },
  {
    dni: '77889900',
    firstName: 'Elena',
    lastName: 'Ramos',
    sex: 'F',
    status: 'available',
    phones: [{ number: '999888777', hasWhatsapp: true }],
    laborData: {
      company: 'PODER JUDICIAL',
      laborStatus: 'nombrado',
      modularCode: 'PJ-999',
      positionCode: 'SEC-10',
      startDate: '2012-05-20'
    }
  },
  {
    dni: '11223344',
    firstName: 'Roberto',
    lastName: 'Mendoza',
    sex: 'M',
    status: 'available',
    phones: [{ number: '911223344', hasWhatsapp: true }],
    laborData: {
      company: 'MINISTERIO DE SALUD',
      laborStatus: 'contratado',
      modularCode: 'SA-444',
      positionCode: 'ENF-02',
      startDate: '2018-09-12'
    }
  },
  {
    dni: '55667788',
    firstName: 'Patricia',
    lastName: 'Ruiz',
    sex: 'F',
    status: 'available',
    phones: [{ number: '955667788', hasWhatsapp: true }],
    laborData: {
      company: 'SUNAT',
      laborStatus: 'nombrado',
      modularCode: 'SU-111',
      positionCode: 'AUD-08',
      startDate: '2014-11-30'
    }
  }
];

export async function seedIfNeeded() {
  const snapshot = await getDocs(collection(db, 'clients'));
  if (snapshot.empty) {
    await forceSeed();
  }
}

export async function forceSeed() {
  console.log('Seeding initial clients...');
  for (const client of SAMPLE_CLIENTS) {
    await addDoc(collection(db, 'clients'), {
      ...client,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }
}
