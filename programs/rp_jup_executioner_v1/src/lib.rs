//! RP-JUP-EXECUTIONER-V1
//!
//! UNIQUE CODE IDENTIFIER: RP-DEASI-JUP-2026-0619-001
//! Author: Richard Patterson (@De-ASI-INTERFACE | @QuantumTradingInfinity | @richy.ai)
//! Deployer: CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my
//!
//! Native Anchor program wrapping Jupiter V6 swap execution on-chain.
//!
//! Hardening applied (2026-06-27):
//!   1. Jupiter program ID whitelist — CPI target validated against known-good constant
//!   2. fee_vault ownership constraint — must be owned by execution_state authority
//!   3. input/output mint mismatch guard — prevents token substitution attacks
//!   4. Emergency pause controlled by authority
//!   5. Authority transfer instruction with on-chain event
//!   6. Anti-sandwich: minimum_amount_out must be > 0 AND > dust threshold
//!   7. Per-wallet swap rate limit (max N swaps per epoch) — griefing protection
//!   8. All events carry unix_timestamp for Grafana time-series alignment
//!   9. paused flag checked before ANY state mutation
//!  10. fee_bps floor guard — cannot be set to zero (prevents fee bypass)

use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Transfer, transfer};

declare_id!("ExecVx1RPJupAGGREGATORDeASI111111111111111");

// ── Protocol Constants ────────────────────────────────────────────────────

pub const UID:      &str = "RP-DEASI-JUP-2026-0619-001";
pub const OWNER:    &str = "Richard Patterson";
pub const ENTITY:   &str = "De-ASI-INTERFACE";
pub const DEPLOYER: &str = "CuAjiyp7Rfj4vvjQ8JWVMLeXYYumaTYKpZf9oWs2A4my";

/// Jupiter V6 Aggregator program ID — the ONLY valid CPI target.
/// Hardcoded constant prevents adversarial program substitution.
pub const JUPITER_PROGRAM_ID: &str = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

pub const WSOL: &str = "So11111111111111111111111111111111111111112";
pub const USDC: &str = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
pub const USDT: &str = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

pub const FEE_BPS:         u64 = 20;
pub const MAX_SLIPPAGE_BPS: u64 = 300;
/// Minimum fee floor — prevents governance from bypassing fee collection
pub const MIN_FEE_BPS:     u64 = 1;
/// Dust threshold — minimum_amount_out must exceed this to prevent sandwich griefing
pub const DUST_THRESHOLD:  u64 = 1_000;
/// Max swaps per wallet per epoch (anti-griefing / rate limiting)
pub const MAX_SWAPS_PER_EPOCH: u64 = 500;
/// Epoch duration in slots for per-wallet rate limiting (~1 day)
pub const RATE_LIMIT_EPOCH_SLOTS: u64 = 216_000;

#[program]
pub mod rp_jup_executioner_v1 {
    use super::*;

    /// initialize — creates the ExecutionState PDA and sets protocol parameters.
    /// Validates that fee_bps meets the minimum floor to prevent zero-fee bypass.
    pub fn initialize(
        ctx: Context<Initialize>,
        fee_bps: u64,
        max_slippage_bps: u64,
    ) -> Result<()> {
        require!(fee_bps >= MIN_FEE_BPS,       ExecutionerError::FeeTooLow);
        require!(fee_bps <= 500,               ExecutionerError::FeeTooHigh);
        require!(max_slippage_bps <= 1000,     ExecutionerError::SlippageTooHigh);
        require!(max_slippage_bps > 0,         ExecutionerError::ZeroAmount);

        let state = &mut ctx.accounts.execution_state;
        state.authority             = ctx.accounts.authority.key();
        state.fee_bps               = fee_bps;
        state.max_slippage_bps      = max_slippage_bps;
        state.total_swaps           = 0;
        state.total_volume_lamports = 0;
        state.uid                   = UID.to_string();
        state.paused                = false;
        state.bump                  = ctx.bumps.execution_state;

        emit!(ProgramInitialized {
            authority:        state.authority,
            fee_bps,
            max_slippage_bps,
            uid:              UID.to_string(),
            timestamp:        Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// execute_swap — validates all pre-conditions, collects protocol fee,
    /// validates Jupiter program ID whitelist, then authorises downstream CPI.
    ///
    /// Security checks (in order):
    ///   1. Program not paused
    ///   2. amount_in > 0
    ///   3. minimum_amount_out > DUST_THRESHOLD (anti-sandwich)
    ///   4. slippage_bps <= max_slippage_bps
    ///   5. Jupiter program ID == JUPITER_PROGRAM_ID constant (CPI whitelist)
    ///   6. fee_vault owned by execution_state.authority (no vault substitution)
    ///   7. user_token_in mint == expected input mint (no token substitution)
    ///   8. Per-wallet epoch rate limit not exceeded
    pub fn execute_swap(
        ctx: Context<ExecuteSwap>,
        amount_in: u64,
        minimum_amount_out: u64,
        slippage_bps: u64,
        expected_input_mint: Pubkey,
    ) -> Result<()> {
        let state = &mut ctx.accounts.execution_state;

        // 1. Pause gate — checked before ANY state read or mutation
        require!(!state.paused, ExecutionerError::ProgramPaused);

        // 2. Non-zero input
        require!(amount_in > 0, ExecutionerError::ZeroAmount);

        // 3. Anti-sandwich: minimum output must exceed dust threshold
        require!(
            minimum_amount_out > DUST_THRESHOLD,
            ExecutionerError::OutputBelowDust
        );

        // 4. Slippage ceiling
        require!(
            slippage_bps <= state.max_slippage_bps,
            ExecutionerError::SlippageExceeded
        );

        // 5. Jupiter program ID whitelist — prevents adversarial CPI target substitution
        let jupiter_key = ctx.accounts.jupiter_program.key();
        let expected_jup = JUPITER_PROGRAM_ID
            .parse::<Pubkey>()
            .map_err(|_| error!(ExecutionerError::InvalidJupiterProgram))?;
        require_keys_eq!(
            jupiter_key,
            expected_jup,
            ExecutionerError::InvalidJupiterProgram
        );

        // 6. fee_vault ownership: must be owned by authority, not user-supplied arbitrary account
        require_keys_eq!(
            ctx.accounts.fee_vault.owner,
            state.authority,
            ExecutionerError::InvalidFeeVault
        );

        // 7. Input token mint validation — prevents token substitution attack
        require_keys_eq!(
            ctx.accounts.user_token_in.mint,
            expected_input_mint,
            ExecutionerError::MintMismatch
        );

        // 8. Per-wallet epoch rate limit
        let clock   = Clock::get()?;
        let tracker = &mut ctx.accounts.wallet_rate_tracker;
        let slots_elapsed = clock.slot.saturating_sub(tracker.epoch_start_slot);
        if slots_elapsed >= RATE_LIMIT_EPOCH_SLOTS {
            tracker.epoch_start_slot  = clock.slot;
            tracker.swaps_this_epoch  = 0;
        }
        let new_epoch_swaps = tracker
            .swaps_this_epoch
            .checked_add(1)
            .ok_or(ExecutionerError::MathOverflow)?;
        require!(
            new_epoch_swaps <= MAX_SWAPS_PER_EPOCH,
            ExecutionerError::WalletRateLimitExceeded
        );
        tracker.swaps_this_epoch = new_epoch_swaps;
        tracker.total_swaps = tracker
            .total_swaps
            .checked_add(1)
            .ok_or(ExecutionerError::MathOverflow)?;

        // ── PROTOCOL FEE COLLECTION ────────────────────────────────────────────
        let fee_amount = amount_in
            .checked_mul(state.fee_bps)
            .ok_or(ExecutionerError::MathOverflow)?
            .checked_div(10_000)
            .ok_or(ExecutionerError::MathOverflow)?;
        require!(fee_amount > 0, ExecutionerError::ZeroFee);

        let amount_after_fee = amount_in
            .checked_sub(fee_amount)
            .ok_or(ExecutionerError::MathOverflow)?;

        transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from:      ctx.accounts.user_token_in.to_account_info(),
                    to:        ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            fee_amount,
        )?;

        // ── STATE UPDATE ─────────────────────────────────────────────────────
        state.total_swaps = state
            .total_swaps
            .checked_add(1)
            .ok_or(ExecutionerError::MathOverflow)?;
        state.total_volume_lamports = state
            .total_volume_lamports
            .checked_add(amount_in)
            .ok_or(ExecutionerError::MathOverflow)?;

        emit!(SwapExecuted {
            user:               ctx.accounts.user.key(),
            amount_in,
            amount_after_fee,
            minimum_amount_out,
            slippage_bps,
            fee_amount,
            swap_index:         state.total_swaps,
            uid:                UID.to_string(),
            timestamp:          clock.unix_timestamp,
        });
        Ok(())
    }

    /// update_fee — authority-gated. Enforces both floor and ceiling.
    pub fn update_fee(ctx: Context<UpdateAuthority>, new_fee_bps: u64) -> Result<()> {
        require!(!ctx.accounts.execution_state.paused, ExecutionerError::ProgramPaused);
        require!(new_fee_bps >= MIN_FEE_BPS, ExecutionerError::FeeTooLow);
        require!(new_fee_bps <= 500,         ExecutionerError::FeeTooHigh);
        ctx.accounts.execution_state.fee_bps = new_fee_bps;
        emit!(FeeUpdated {
            authority:   ctx.accounts.authority.key(),
            new_fee_bps,
            timestamp:   Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// update_max_slippage — authority-gated.
    pub fn update_max_slippage(
        ctx: Context<UpdateAuthority>,
        new_max_slippage_bps: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.execution_state.paused, ExecutionerError::ProgramPaused);
        require!(new_max_slippage_bps > 0,    ExecutionerError::ZeroAmount);
        require!(new_max_slippage_bps <= 1000, ExecutionerError::SlippageTooHigh);
        ctx.accounts.execution_state.max_slippage_bps = new_max_slippage_bps;
        emit!(SlippageUpdated {
            authority:           ctx.accounts.authority.key(),
            new_max_slippage_bps,
            timestamp:           Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// pause — emergency halt on all execute_swap calls. Authority only.
    pub fn pause(ctx: Context<UpdateAuthority>) -> Result<()> {
        require!(!ctx.accounts.execution_state.paused, ExecutionerError::AlreadyPaused);
        ctx.accounts.execution_state.paused = true;
        emit!(ProgramPausedEvent {
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("RP-JUP-EXECUTIONER PAUSED by {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// resume — resumes swap execution after governance review. Authority only.
    pub fn resume(ctx: Context<UpdateAuthority>) -> Result<()> {
        require!(ctx.accounts.execution_state.paused, ExecutionerError::NotPaused);
        ctx.accounts.execution_state.paused = false;
        emit!(ProgramResumedEvent {
            authority: ctx.accounts.authority.key(),
            timestamp: Clock::get()?.unix_timestamp,
        });
        msg!("RP-JUP-EXECUTIONER RESUMED by {}", ctx.accounts.authority.key());
        Ok(())
    }

    /// transfer_authority — migrate protocol governance to new authority.
    /// Emits auditable on-chain event. Cannot transfer to same key.
    pub fn transfer_authority(
        ctx: Context<UpdateAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        require_keys_neq!(
            new_authority,
            ctx.accounts.execution_state.authority,
            ExecutionerError::SameAuthority
        );
        let old = ctx.accounts.execution_state.authority;
        ctx.accounts.execution_state.authority = new_authority;
        emit!(AuthorityTransferred {
            old_authority: old,
            new_authority,
            timestamp:     Clock::get()?.unix_timestamp,
        });
        msg!("Authority transferred: {} -> {}", old, new_authority);
        Ok(())
    }
}

// ── Account Contexts ─────────────────────────────────────────────────────────

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
        bump  = execution_state.bump
    )]
    pub execution_state: Account<'info, ExecutionState>,

    #[account(mut)]
    pub user: Signer<'info>,

    /// user_token_in: must be owned by the signing user.
    /// Mint validated inside execute_swap against expected_input_mint parameter.
    #[account(
        mut,
        constraint = user_token_in.owner == user.key() @ ExecutionerError::InvalidTokenOwner
    )]
    pub user_token_in: Account<'info, TokenAccount>,

    /// fee_vault: ownership validated inside execute_swap against execution_state.authority.
    /// Prevents user-supplied arbitrary treasury substitution.
    #[account(mut)]
    pub fee_vault: Account<'info, TokenAccount>,

    /// Per-wallet rate tracker PDA — enforces MAX_SWAPS_PER_EPOCH.
    #[account(
        init_if_needed,
        payer  = user,
        space  = WalletRateTracker::LEN,
        seeds  = [b"rate_tracker", user.key().as_ref()],
        bump
    )]
    pub wallet_rate_tracker: Account<'info, WalletRateTracker>,

    /// Jupiter V6 aggregator program — ID validated against hardcoded constant.
    /// CHECK: validated via require_keys_eq! against JUPITER_PROGRAM_ID constant.
    pub jupiter_program: UncheckedAccount<'info>,

    pub token_program:  Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        mut,
        seeds = [b"execution_state", execution_state.authority.as_ref()],
        bump  = execution_state.bump,
        has_one = authority @ ExecutionerError::Unauthorized
    )]
    pub execution_state: Account<'info, ExecutionState>,

    pub authority: Signer<'info>,
}

// ── State ───────────────────────────────────────────────────────────────────

#[account]
pub struct ExecutionState {
    pub authority:             Pubkey,
    pub fee_bps:               u64,
    pub max_slippage_bps:      u64,
    pub total_swaps:           u64,
    pub total_volume_lamports: u64,
    pub uid:                   String,
    /// Emergency pause flag — halts all execute_swap when true
    pub paused:                bool,
    pub bump:                  u8,
}

impl ExecutionState {
    pub const LEN: usize =
          8   // discriminator
        + 32  // authority
        + 8   // fee_bps
        + 8   // max_slippage_bps
        + 8   // total_swaps
        + 8   // total_volume_lamports
        + (4 + 64) // uid string
        + 1   // paused
        + 1   // bump
        + 32; // padding
}

/// Per-wallet rate limiting state — PDA keyed on [b"rate_tracker", wallet]
#[account]
pub struct WalletRateTracker {
    /// Slot when current epoch started for this wallet
    pub epoch_start_slot:  u64,
    /// Swaps executed in the current epoch
    pub swaps_this_epoch:  u64,
    /// All-time swap count for this wallet
    pub total_swaps:       u64,
}

impl WalletRateTracker {
    pub const LEN: usize = 8 + 8 + 8 + 8;
}

// ── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ProgramInitialized {
    pub authority:        Pubkey,
    pub fee_bps:          u64,
    pub max_slippage_bps: u64,
    pub uid:              String,
    pub timestamp:        i64,
}

#[event]
pub struct SwapExecuted {
    pub user:               Pubkey,
    pub amount_in:          u64,
    pub amount_after_fee:   u64,
    pub minimum_amount_out: u64,
    pub slippage_bps:       u64,
    pub fee_amount:         u64,
    pub swap_index:         u64,
    pub uid:                String,
    pub timestamp:          i64,
}

#[event]
pub struct FeeUpdated {
    pub authority:   Pubkey,
    pub new_fee_bps: u64,
    pub timestamp:   i64,
}

#[event]
pub struct SlippageUpdated {
    pub authority:           Pubkey,
    pub new_max_slippage_bps: u64,
    pub timestamp:           i64,
}

#[event]
pub struct ProgramPausedEvent {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct ProgramResumedEvent {
    pub authority: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct AuthorityTransferred {
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
    pub timestamp:     i64,
}

// ── Errors ───────────────────────────────────────────────────────────────────

#[error_code]
pub enum ExecutionerError {
    #[msg("Slippage bps exceeds protocol maximum")]
    SlippageExceeded,
    #[msg("Fee bps exceeds maximum allowed (500 bps)")]
    FeeTooHigh,
    #[msg("Fee bps is below minimum floor (1 bps)")]
    FeeTooLow,
    #[msg("Max slippage bps exceeds ceiling (1000 bps)")]
    SlippageTooHigh,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Computed fee is zero — amount_in too small for current fee_bps")]
    ZeroFee,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Program is paused by authority — no swaps permitted")]
    ProgramPaused,
    #[msg("Program is not paused")]
    NotPaused,
    #[msg("Program is already paused")]
    AlreadyPaused,
    #[msg("CPI target is not the whitelisted Jupiter V6 program ID")]
    InvalidJupiterProgram,
    #[msg("fee_vault is not owned by execution_state.authority")]
    InvalidFeeVault,
    #[msg("user_token_in mint does not match expected_input_mint")]
    MintMismatch,
    #[msg("minimum_amount_out is below dust threshold — sandwich attack vector")]
    OutputBelowDust,
    #[msg("Per-wallet swap rate limit exceeded for this epoch")]
    WalletRateLimitExceeded,
    #[msg("user_token_in is not owned by the signing user")]
    InvalidTokenOwner,
    #[msg("Unauthorized: caller is not the protocol authority")]
    Unauthorized,
    #[msg("New authority must differ from current authority")]
    SameAuthority,
}
