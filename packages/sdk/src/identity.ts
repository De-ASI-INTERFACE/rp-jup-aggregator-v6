/**
 * UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
 * Author: Richard Patterson (@De-ASI-INTERFACE | @QuantumTradingInfinity | @richy.ai)
 * Deployer: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
 * Program: RP-JUP-EXECUTIONER-V1
 */
export const UID = 'RP-DEASI-JUP-2026-0619-001';
export const PROGRAM_NAME = 'RP-JUP-EXECUTIONER-V1';
export const OWNER = 'Richard Patterson';
export const ENTITY = 'De-ASI-INTERFACE';
export const DEPLOYER = 'CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my';
export const PROGRAM_ID = 'ExecVx1RPJupAGGREGATORDeASI111111111111111';
export const AMM_ADDRESS = 'AMM1111111111111111111111111111111111111111';
export const WSOL = 'So11111111111111111111111111111111111111112';
export const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';

export function accreditationBlock(): string {
  return `${PROGRAM_NAME} | ${OWNER} | ${ENTITY} | ${UID} | Program: ${PROGRAM_ID}`;
}
