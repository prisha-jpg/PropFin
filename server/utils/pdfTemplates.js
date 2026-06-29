export const demandLetterTemplate = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #334155;
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }
  .header {
    border-bottom: 2px solid #0f766e;
    padding-bottom: 20px;
    margin-bottom: 30px;
  }
  .logo {
    font-size: 28px;
    font-weight: bold;
    color: #0f766e;
    letter-spacing: -1px;
  }
  .company-info {
    text-align: right;
    font-size: 12px;
    color: #64748b;
  }
  .title {
    font-size: 22px;
    font-weight: bold;
    color: #1e293b;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .grid {
    display: table;
    width: 100%;
    margin-bottom: 30px;
  }
  .col {
    display: table-cell;
    width: 50%;
    vertical-align: top;
  }
  .col-label {
    font-size: 11px;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 5px;
    font-weight: bold;
  }
  .col-value {
    font-size: 14px;
    color: #1e293b;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 30px;
  }
  th {
    background-color: #f1f5f9;
    color: #0f766e;
    text-align: left;
    font-weight: bold;
    font-size: 13px;
    padding: 10px;
    border-bottom: 2px solid #cbd5e1;
  }
  td {
    padding: 12px 10px;
    font-size: 13px;
    border-bottom: 1px solid #e2e8f0;
  }
  .text-right {
    text-align: right;
  }
  .total-row td {
    font-weight: bold;
    font-size: 14px;
    background-color: #f8fafc;
    border-top: 2px solid #cbd5e1;
    border-bottom: 2px solid #cbd5e1;
    color: #0f766e;
  }
  .bank-details {
    background-color: #f0fdfa;
    border-left: 4px solid #0f766e;
    padding: 15px;
    margin-top: 30px;
    border-radius: 4px;
  }
  .bank-title {
    font-weight: bold;
    color: #0f766e;
    font-size: 14px;
    margin-bottom: 10px;
  }
  .bank-grid {
    display: table;
    width: 100%;
    font-size: 12px;
  }
  .bank-col {
    display: table-cell;
    width: 50%;
    padding-bottom: 5px;
  }
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 10px;
  }
</style>
</head>
<body>
  <div class="header">
    <table style="width:100%; border:0; margin:0;">
      <tr>
        <td style="border:0; padding:0;"><div class="logo">PropFin</div></td>
        <td style="border:0; padding:0; text-align:right;" class="company-info">
          <strong>PropFin Developers Pvt Ltd</strong><br>
          100, Outer Ring Road, Bangalore - 560103<br>
          Email: accounts@propfin.com | Web: www.propfin.com
        </td>
      </tr>
    </table>
  </div>

  <div class="title">Demand Letter</div>

  <div class="grid">
    <div class="col">
      <div class="col-label">Issued To</div>
      <div class="col-value">
        <strong>{{customerName}}</strong><br>
        Unit No: {{unitNumber}}<br>
        Sales Order Ref: {{orderNumber}}
      </div>
    </div>
    <div class="col" style="text-align: right;">
      <div class="col-label">Details</div>
      <div class="col-value">
        <strong>Demand No:</strong> {{demandNumber}}<br>
        <strong>Demand Date:</strong> {{demandDate}}<br>
        <strong style="color: #ef4444;">Due Date:</strong> {{dueDate}}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="text-right">Amount (INR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Milestone Demanded: <strong>{{milestoneDescription}}</strong> (Base Amount)</td>
        <td class="text-right">{{baseAmount}}</td>
      </tr>
      <tr>
        <td>Goods & Services Tax (GST)</td>
        <td class="text-right">{{gstAmount}}</td>
      </tr>
      {{#if otherCharges}}
      <tr>
        <td>Other Charges / Deposits</td>
        <td class="text-right">{{otherCharges}}</td>
      </tr>
      {{/if}}
      {{#if interestAmount}}
      <tr>
        <td>Interest on Late Payments</td>
        <td class="text-right">{{interestAmount}}</td>
      </tr>
      {{/if}}
      <tr class="total-row">
        <td>Total Outstanding Due Amount</td>
        <td class="text-right">{{totalDue}}</td>
      </tr>
    </tbody>
  </table>

  <div class="bank-details">
    <div class="bank-title">Escrow Bank Details for Payments</div>
    <div style="font-size: 13px; margin-bottom: 8px;">Please make all payments via RTGS/NEFT/IMPS to our designated escrow account below:</div>
    <div class="bank-grid">
      <div class="bank-col"><strong>Account Name:</strong> {{escrowAccountName}}</div>
      <div class="bank-col"><strong>Bank Name:</strong> {{escrowBankName}}</div>
    </div>
    <div class="bank-grid">
      <div class="bank-col"><strong>Account Number:</strong> {{escrowAccountNumber}}</div>
      <div class="bank-col"><strong>IFSC Code:</strong> {{escrowIfsc}}</div>
    </div>
    <div class="bank-grid">
      <div class="bank-col"><strong>Branch:</strong> {{escrowBranch}}</div>
      <div class="bank-col"></div>
    </div>
  </div>

  <div class="footer">
    This is an automatically generated document. If you have any queries, please email us at accounts@propfin.com.
  </div>
</body>
</html>`;

export const receiptTemplate = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #334155;
    margin: 0;
    padding: 0;
    line-height: 1.5;
  }
  .header {
    border-bottom: 2px solid #0f766e;
    padding-bottom: 20px;
    margin-bottom: 30px;
  }
  .logo {
    font-size: 28px;
    font-weight: bold;
    color: #0f766e;
    letter-spacing: -1px;
  }
  .company-info {
    text-align: right;
    font-size: 12px;
    color: #64748b;
  }
  .title {
    font-size: 22px;
    font-weight: bold;
    color: #1e293b;
    text-transform: uppercase;
    margin-bottom: 20px;
  }
  .grid {
    display: table;
    width: 100%;
    margin-bottom: 30px;
  }
  .col {
    display: table-cell;
    width: 50%;
    vertical-align: top;
  }
  .col-label {
    font-size: 11px;
    text-transform: uppercase;
    color: #94a3b8;
    margin-bottom: 5px;
    font-weight: bold;
  }
  .col-value {
    font-size: 14px;
    color: #1e293b;
  }
  .receipt-box {
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 35px;
  }
  .receipt-header {
    background-color: #0f766e;
    color: white;
    font-weight: bold;
    padding: 15px;
    font-size: 16px;
    text-transform: uppercase;
  }
  .receipt-body {
    padding: 20px;
  }
  .receipt-row {
    display: table;
    width: 100%;
    padding: 10px 0;
    border-bottom: 1px dashed #e2e8f0;
  }
  .receipt-row:last-child {
    border-bottom: 0;
  }
  .row-label {
    display: table-cell;
    width: 40%;
    font-weight: bold;
    color: #64748b;
  }
  .row-value {
    display: table-cell;
    width: 60%;
    color: #1e293b;
  }
  .amount-highlight {
    font-size: 24px;
    font-weight: bold;
    color: #0f766e;
  }
  .footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 10px;
    color: #94a3b8;
    border-top: 1px solid #e2e8f0;
    padding-top: 10px;
  }
</style>
</head>
<body>
  <div class="header">
    <table style="width:100%; border:0; margin:0;">
      <tr>
        <td style="border:0; padding:0;"><div class="logo">PropFin</div></td>
        <td style="border:0; padding:0; text-align:right;" class="company-info">
          <strong>PropFin Developers Pvt Ltd</strong><br>
          100, Outer Ring Road, Bangalore - 560103<br>
          Email: accounts@propfin.com | Web: www.propfin.com
        </td>
      </tr>
    </table>
  </div>

  <div class="title">Receipt of Payment</div>

  <div class="grid">
    <div class="col">
      <div class="col-label">Received From</div>
      <div class="col-value">
        <strong>{{customerName}}</strong><br>
        Unit No: {{unitNumber}}<br>
        Sales Order Ref: {{orderNumber}}
      </div>
    </div>
    <div class="col" style="text-align: right;">
      <div class="col-label">Receipt Details</div>
      <div class="col-value">
        <strong>Receipt No:</strong> {{receiptNumber}}<br>
        <strong>Receipt Date:</strong> {{receiptDate}}<br>
        <strong>Status:</strong> Cleared
      </div>
    </div>
  </div>

  <div class="receipt-box">
    <div class="receipt-header">Payment Breakdown</div>
    <div class="receipt-body">
      <div class="receipt-row">
        <div class="row-label">Amount Received:</div>
        <div class="row-value amount-highlight">{{amountReceived}}</div>
      </div>
      <div class="receipt-row">
        <div class="row-label">Payment Mode:</div>
        <div class="row-value" style="text-transform: uppercase;">{{paymentMode}}</div>
      </div>
      {{#if transactionReference}}
      <div class="receipt-row">
        <div class="row-label">Reference No:</div>
        <div class="row-value">{{transactionReference}}</div>
      </div>
      {{/if}}
      {{#if narration}}
      <div class="receipt-row">
        <div class="row-label">Remarks / Towards:</div>
        <div class="row-value">{{narration}}</div>
      </div>
      {{/if}}
      <div class="receipt-row" style="background-color: #f8fafc; margin-top: 10px; padding: 12px 10px;">
        <div class="row-label" style="color: #475569;">Remaining Outstanding Balance:</div>
        <div class="row-value" style="font-weight: bold; color: #475569;">{{remainingBalance}}</div>
      </div>
    </div>
  </div>

  <div class="footer">
    This is a computer-generated payment receipt and does not require a physical signature.
  </div>
</body>
</html>`;
