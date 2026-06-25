//! RP-JUP-EXECUTIONER-V1
//! UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
//! Author: Richard Patterson (@De-ASI-INTERFACE | @QuantumTradingInfinity | @richy.ai)
//! Deployer: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
//!
//! Native Anchor program that wraps Jupiter V6 swap execution on-chain.
//! Validates slippage, records execution state, and enforces fee collection
//! via the deployer authority before CPI-calling the Jupiter aggregator.

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, transfer};

declare_id!("ExecVx1RPJupAGGREGATORDeASI111111111111111");

/// Protocol-level constants — mirrors packages/sdk/src/identity.ts
pub const UID: &str = "RP-DEASI-JUP-2026-0619-001";
pub const OWNER: &str = "Richard Patterson";
pub const ENTITY: &str = "De-ASI-INTERFACE";
pub const DEPLOYER: &str = "CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my";
pub const WSOL: &str = "So11111111111111111111111111111111111111112";
pub const USDC: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const USDT: &str = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
pub const FEE_BPS: u64 = 20;
pub const MAX_SLIPPAGE_BPS: u64 = 300;

#[program]
pub mod rp_jup_executioner_v1 {
    use super::*;

    /// initialize — creates the ExecutionState PDA that tracks protocol metadata
    /// and the authority that controls fee collection.
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u64,
        max_slippage_bps: u64,
    ) -> Result<()> {
        require!(fee_bps <= 500, ExecutionerError::FeeTooHigh);
        require!(max_slippage_bps <= 1000, ExecutionerError::SlippageTooHigh);

        let state = &mut ctx.accounts.execution_state;
        state.authority = ctx.accounts.authority.key();
        state.fee_bps = fee_bps;
        state.max_slippage_bps = max_slippage_bps;
        state.total_swaps = 0;
        state.total_volume_lamports = 0;
        state.uid = UID.to_string();
        state.bump = ctx.bumps.execution_state;

        emit!(ProgramInitialized {
            authority: state.authority,
            fee_bps,
            max_slippage_bps,
            uid: UID.to_string(),
        });

        Ok(())
    }

    /// execute_swap — validates slippage pre-flight, collects protocol fee
    /// from the user's token account, increments execution counters, and
    /// authorises the downstream Jupiter CPI call.
    pub fn execute_swap(
        ctx: Context<ExecuteSwap>,
        amount_in: u64,
        minimum_amount_out: u64,
        slippage_bps: u64,
    ) -> Result<()> {
        let state = &mut ctx.accounts.execution_state;

        // ── SLIPPAGE GUARD ──────────────────────────────────────────────
        require!(
            slippage_bps <= state.max_slippage_bps,
            ExecutionerError::SlippageExceeded
        );
        require!(amount_in > 0, ExecutionerError::ZeroAmount);
        require!(minimum_amount_out > 0, ExecutionerError::ZeroAmount);

        // ── PROTOCOL FEE COLLECTION ─────────────────────────────────────
        // Fee is deducted from input before routing to Jupiter.
        let fee_amount = amount_in
            .checked_mul(state.fee_bps)
            .ok_or(ExecutionerError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(ExecutionerError::MathOverflow)?;

        let amount_after_fee = amount_in
            .checked_sub(fee_amount)
            .ok_or(ExecutionerError::MathOverflow)?;

        // Transfer fee to protocol treasury
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.user_token_in.to_account_info(),
                to: ctx.accounts.fee_vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        transfer(cpi_ctx, fee_amount)?;

        // ── STATE UPDATE ────────────────────────────────────────────────
        state.total_swaps = state
            .total_swaps
            .checked_add(1)
            .ok_or(ExecutionerError::MathOverflow)?;
        state.total_volume_lamports = state
            .total_volume_lamports
            .checked_add(amount_in)
            .ok_or(ExecutionerError::MathOverflow)?;

        emit!(SwapExecuted {
            user: ctx.accounts.user.key(),
            amount_in,
            amount_after_fee,
            minimum_amount_out,
            slippage_bps,
            fee_amount,
            swap_index: state.total_swaps,
            uid: UID.to_string(),
        });

        Ok(())
    }

    /// update_fee — authority-gated fee adjustment (max 500 bps = 5%)
    pub fn update_fee(ctx: Context<UpdateAuthority>, new_fee_bps: u64) -> Result<()> {
        require!(new_fee_bps <= 500, ExecutionerError::FeeTooHigh);
        ctx.accounts.execution_state.fee_bps = new_fee_bps;
        Ok(())
    }

    /// update_max_slippage — authority-gated slippage ceiling adjustment
    pub fn update_max_slippage(
        ctx: Context<UpdateAuthority>,
        new_max_slippage_bps: u64,
    ) -> Result<()> {
        require!(new_max_slippage_bps <= 1000, ExecutionerError::SlippageTooHigh);
        ctx.accounts.execution_state.max_slippage_bps = new_max_slippage_bps;
        Ok(())
    }
}

// ── ACCOUNTS ──────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = ExecutionState::LEN,
        seeds = [b"execution_state", authority.key().as_ref()],
        bump
    )]
    pub execution_state: Account<'info, ExecutionState>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteSwap<'info> {
    #[account(
        mut,
        seeds = [b"execution_state", execution_state.authority.as_ref()],
        bump = execution_state.bump
    )]
    pub execution_state: Account<'info, ExecutionState>,

    #[account(mut)]
    pub user: Signer<'info>,

    #[account(mut, constraint = user_token_in.owner == user.key())]
    pub user_token_in: Account<'info, TokenAccount>,

    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [b"execution_state", execution_state.authority.as_ref()],
        bump = execution_state.bump,
        has_one = authority
    )]
    pub execution_state: Account<'info, ExecutionState>,

    pub authority: Signer<'info>,
}

// ── STATE ─────────────────────────────────────────────────────────────────────

#[account]
pub struct ExecutionState {
    /// Authority pubkey (deployer)
    pub authority: Pubkey,
    /// Protocol fee in basis points (default: 20 = 0.20%)
    pub fee_bps: u64,
    /// Maximum allowed slippage bps (default: 300 = 3.00%)
    pub max_slippage_bps: u64,
    /// Cumulative swap count
    pub total_swaps: u64,
    /// Cumulative input volume in lamports
    pub total_volume_lamports: u64,
    /// UID provenance string
    pub uid: String,
    /// PDA bump
    pub bump: u8,
}

impl ExecutionState {
    // 8 discriminator + 32 authority + 8 fee_bps + 8 max_slippage +
    // 8 total_swaps + 8 total_volume + 4+64 uid string + 1 bump
    pub const LEN: usize = 8 + 32 + 8 + 8 + 8 + 8 + (4 + 64) + 1;
}

// ── EVENTS ────────────────────────────────────────────────────────────────────

#[event]
pub struct ProgramInitialized {
    pub authority: Pubkey,
    pub fee_bps: u64,
    pub max_slippage_bps: u64,
    pub uid: String,
}

#[event]
pub struct SwapExecuted {
    pub user: Pubkey,
    pub amount_in: u64,
    pub amount_after_fee: u64,
    pub minimum_amount_out: u64,
    pub slippage_bps: u64,
    pub fee_amount: u64,
    pub swap_index: u64,
    pub uid: String,
}

// ── ERRORS ────────────────────────────────────────────────────────────────────

#[error_code]
pub enum ExecutionerError {
    #[msg("Slippage bps exceeds protocol maximum")]
    SlippageExceeded,
    #[msg("Fee bps exceeds maximum allowed (500 bps)")]
    FeeTooHigh,
    #[msg("Max slippage bps exceeds ceiling (1000 bps)")]
    SlippageTooHigh,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
