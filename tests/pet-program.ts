import * as anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import { PetProgram } from '../target/types/pet_program';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';
import * as fs from 'fs';
import { assert } from 'chai';

describe('pet-program', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const payer = provider.wallet as anchor.Wallet;
  const connection = provider.connection;

  const program = anchor.workspace.PetProgram as Program<PetProgram>;
  const mintKeyPair = anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(
      JSON.parse(
        fs.readFileSync(
          './keys/HapYFqqgjrXJof1ZFdf4xeVsQcpYkYJdAntP2NzQUyik.json',
          'utf-8',
        ),
      ),
    ),
  );
  console.log('mintKeyPair', mintKeyPair.publicKey.toBase58());

  async function createMintToken() {
    // check to see if mint exists
    const mintInfo = await connection.getAccountInfo(mintKeyPair.publicKey);
    if (mintInfo) {
      console.log('mint exists');
      return;
    }

    await createMint(
      connection,
      payer.payer,
      payer.publicKey,
      payer.publicKey,
      0,
      mintKeyPair,
    );
  }

  it('pet initialized!', async () => {
    const [petAccount, petBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('pet', 'utf8'), payer.publicKey.toBuffer()],
      program.programId,
    );

    const txHash = await program.methods
      .initialize()
      .accounts({
        newPetDataAccount: petAccount,
        signer: program.provider.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([payer.payer])
      .rpc({
        commitment: 'confirmed',
      });

    console.log('petAccount', petAccount.toBase58());

    await getTransactionLogs(connection, txHash).then((logs) => {
      console.log('Logs', logs);
    });

    const petAccountData = await program.account.petDataAccount.fetch(
      petAccount,
    );
    console.log('Happiness Level:', petAccountData.happiness.toString());

    assert.equal(petAccountData.happiness, 100, 'wrong happiness level');
  });

  it('play pet', async () => {
    await createMintToken();

    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      payer.payer,
      mintKeyPair.publicKey,
      payer.publicKey,
    );
    console.log('userTokenAccount', userTokenAccount.address.toBase58());

    await mintTo(
      connection,
      payer.payer,
      mintKeyPair.publicKey,
      userTokenAccount.address,
      payer.payer,
      100,
    );

    const [petAccount, petBump] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from('pet', 'utf8'), payer.publicKey.toBuffer()],
      program.programId,
    );

    let petAccountData = await program.account.petDataAccount.fetch(petAccount);
    console.log(
      'PetAccountData playedAtSlot:',
      petAccountData.playedAtSlot.toNumber(),
    );

    // get current slot of connection
    let currentSlot = await connection.getSlot();
    console.log('currentSlot', currentSlot);

    // wait 5 slots
    const numSlotsToWait = 5;
    await connection.getSlot().then(async (currentSlot) => {
      const targetSlot = currentSlot + numSlotsToWait;
      console.log(`Waiting until slot ${targetSlot}...`);
      while (true) {
        const slot = await connection.getSlot();
        if (slot > targetSlot) {
          break;
        }
      }
      console.log(`Reached slot ${targetSlot}`);
    });

    currentSlot = await connection.getSlot();
    console.log('currentSlot', currentSlot);

    const amount = 5;
    const tx = await program.methods
      .playPet(amount)
      .signers([payer.payer])
      .accounts({
        signer: payer.publicKey,
        petDataAccount: petAccount,
        userTokenAccount: userTokenAccount.address,
        mint: mintKeyPair.publicKey,
      })
      .rpc({
        commitment: 'confirmed',
      });

    console.log('petAccount', petAccount.toBase58());

    await getTransactionLogs(connection, tx).then((logs) => {
      console.log('Logs', logs);
    });

    petAccountData = await program.account.petDataAccount.fetch(petAccount);
    console.log('Happiness Level:', petAccountData.happiness.toString());

    assert.equal(petAccountData.happiness, 85, 'wrong happiness level');
  });
});

async function getTransactionLogs(
  connection: anchor.web3.Connection,
  txId: string,
) {
  try {
    const parsedTx = await connection.getParsedTransaction(txId, 'confirmed');
    if (parsedTx && parsedTx.meta && parsedTx.meta.logMessages) {
      return parsedTx.meta.logMessages;
    } else {
      console.error('No logs found for this transaction.');
      return null;
    }
  } catch (err) {
    console.error('Error fetching transaction:', err);
    return null;
  }
}
