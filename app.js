document.getElementById('paymentForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const phoneInput = document.getElementById('phone').value.trim();
    const amountInput = document.getElementById('amount').value.trim();
    const payButton = document.getElementById('payButton');
    const messageEl = document.getElementById('message');

    // Format phone number to 2547XXXXXXXX or 2541XXXXXXXX
    let formattedPhone = phoneInput;
    if (formattedPhone.startsWith('0')) {
        formattedPhone = '254' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('+')) {
        formattedPhone = formattedPhone.slice(1);
    }

    // Reset feedback and show loading state
    messageEl.textContent = 'Sending STK push request... Please check your phone.';
    messageEl.style.color = '#334155';
    payButton.disabled = true;
    payButton.textContent = 'Processing...';

    try {
        const response = await fetch('http://localhost:3000/api/stkpush', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        phone: formattedPhone,
        amount: amountInput
    })
});

        const data = await response.json();

        if (response.ok) {
            messageEl.textContent = 'STK push sent successfully! Check your phone to enter your M-Pesa PIN.';
            messageEl.style.color = '#16a34a';
        } else {
            const errorMsg = data.error?.errorMessage || data.error || 'Failed to process request.';
            messageEl.textContent = `Error: ${errorMsg}`;
            messageEl.style.color = '#dc2626';
        }
    } catch (error) {
        console.error('Network error:', error);
        messageEl.textContent = 'Network error. Please check your connection and try again.';
        messageEl.style.color = '#dc2626';
    } finally {
        payButton.disabled = false;
        payButton.textContent = 'Request M-Pesa prompt';
    }
});