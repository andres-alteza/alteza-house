# Alteza House

Alteza House manages tenant contracts, monthly rent payments, payment proofs, and payment reminders for houses.

## Language

**Tenant**:
A person registered to occupy a house under a contract.
_Avoid_: Renter

**Guardian**:
The tenant's responsible contact, stored as the tenant's parent or acudiente information.
_Avoid_: Parent when referring to the business role

**Contract**:
An approved agreement that defines a tenant's covered dates and monthly rent amount.
_Avoid_: Lease

**Payment Proof**:
Evidence uploaded by a tenant for a monthly rent payment.
_Avoid_: Receipt

**Pending Payment Proof**:
A payment proof that has been uploaded but not approved by an admin.
_Avoid_: Unpaid payment

**Approved Payment**:
A payment proof that an admin has accepted as paid rent.
_Avoid_: Confirmed proof

**Payment Due Day**:
The configured day of the month by which rent should be paid.
_Avoid_: Notification day

**Overdue Balance**:
The sum of contract-month rent amounts that do not have enough approved payments through the current reminder month.
_Avoid_: Pending payments

**WhatsApp Payment Reminder**:
A daily template message sent after the payment due day to tenants and guardians while they have an overdue balance.
_Avoid_: Collection notice

## Relationships

- A **Tenant** has one **Guardian** contact.
- A **Tenant** may have one active approved **Contract** for a month.
- A **Contract** defines the monthly rent used to calculate an **Overdue Balance**.
- A **Pending Payment Proof** does not reduce the **Overdue Balance**.
- An **Approved Payment** reduces the **Overdue Balance** for its contract month.
- A **WhatsApp Payment Reminder** is sent to both the **Tenant** and **Guardian** each day after the **Payment Due Day** while the **Overdue Balance** is greater than zero.

## Example Dialogue

> **Dev:** "Should a pending payment count as paid for the WhatsApp reminder?"
> **Domain expert:** "No. Only an **Approved Payment** reduces the **Overdue Balance**; a **Pending Payment Proof** is still waiting for admin approval."

## Flagged Ambiguities

- "Not paid" was used to mean no accepted rent payment; resolved: only **Approved Payment** counts as paid.
- "Payment due date" was used near notification timing; resolved: **Payment Due Day** is the rent deadline, and reminders are sent after it.
