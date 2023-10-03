use anchor_lang::prelude::*;
use anchor_spl::{
  token::{ TokenAccount, Mint, Token, Burn, burn },
  associated_token::AssociatedToken,
};

declare_id!("PetyQKNeqSCSxyrjgiMJvyjU3aktgKmoEimVBCfRjZb");

pub mod constants {
  pub const PET_SEED: &[u8] = b"pet";
}

#[error_code]
pub enum ErrorCode {
  #[msg("No tokens to play")]
  NoTokensToPlay,
}

#[program]
pub mod pet_program {
  use super::*;
  pub fn initialize(ctx: Context<InitializePet>) -> Result<()> {
    msg!("New pet initialized successfully! 🐶");

    let pet_data_account = &mut ctx.accounts.new_pet_data_account;
    pet_data_account.happiness = 100;

    let clock = Clock::get()?;
    pet_data_account.played_at_slot = clock.slot;

    Ok(())
  }

  pub fn play_pet(ctx: Context<PlayPet>, amount: u8) -> Result<()> {
    let pet_data_account = &mut ctx.accounts.pet_data_account;
    pet_data_account.happiness = pet_data_account.happiness
      .checked_sub(amount)
      .unwrap();

    if amount == 0 {
      return Err(ErrorCode::NoTokensToPlay.into());
    }

    let clock = Clock::get()?;

    // find diff between current clock and last played slot
    let diff = clock.slot.checked_sub(pet_data_account.played_at_slot).unwrap();
    msg!("Diff between current slot and previous played slot: {}", diff);

    // subtract happiness by diff
    pet_data_account.happiness = pet_data_account.happiness
      .checked_sub(diff.try_into().unwrap())
      .unwrap();
    msg!("Happiness after time has passed: {}", pet_data_account.happiness);

    let burn_amount = (amount as u64)
      .checked_mul((10u64).pow(ctx.accounts.mint.decimals as u32))
      .unwrap();

    burn(
      CpiContext::new(ctx.accounts.token_program.to_account_info(), Burn {
        mint: ctx.accounts.mint.to_account_info(),
        from: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.signer.to_account_info(),
      }),
      burn_amount
    )?;

    Ok(())
  }
}

#[derive(Accounts)]
pub struct InitializePet<'info> {
  #[account(mut)]
  pub signer: Signer<'info>,

  #[account(
    init_if_needed,
    seeds = [constants::PET_SEED, signer.key().as_ref()],
    bump,
    payer = signer,
    space = 8 + std::mem::size_of::<PetDataAccount>()
  )]
  pub new_pet_data_account: Account<'info, PetDataAccount>,

  pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlayPet<'info> {
  #[account(mut)]
  pub signer: Signer<'info>,

  #[account(mut, associated_token::mint = mint, associated_token::authority = signer)]
  pub user_token_account: Account<'info, TokenAccount>,

  #[account(mut)]
  pub mint: Account<'info, Mint>,

  #[account(mut, seeds = [constants::PET_SEED, signer.key().as_ref()], bump)]
  pub pet_data_account: Account<'info, PetDataAccount>,

  pub token_program: Program<'info, Token>,
  pub associated_token_program: Program<'info, AssociatedToken>,
  pub system_program: Program<'info, System>,
}

#[account]
pub struct PetDataAccount {
  pub happiness: u8,
  pub played_at_slot: u64,
}
