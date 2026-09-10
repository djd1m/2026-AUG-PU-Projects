import type { Pool } from 'pg';
import { OnboardingError, type AdmissionRepositoryContract } from './onboarding-contract';
import { decodeAdmission } from './onboarding-codecs';
import { safeDatabaseError } from './onboarding-repository';
export class AdmissionRepository implements AdmissionRepositoryContract {
  constructor(private readonly pool:Pool) {}
  private async charge(slot:number,sql:string) {
    if(!Number.isInteger(slot)||slot<0||slot>4095)throw new OnboardingError('invalid_input');
    try { const r=await this.pool.query<{result:unknown}>(sql,[slot]);return decodeAdmission(r.rows[0]?.result); }
    catch(error) {throw safeDatabaseError(error);}
  }
  chargeSource(slot:number) {return this.charge(slot,'SELECT n3a.onboarding_charge_source($1) AS result');}
  chargeIdentity(slot:number) {return this.charge(slot,'SELECT n3a.onboarding_charge_identity($1) AS result');}
}
