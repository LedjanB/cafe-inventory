// Utility functions
function showMessage(message, type = 'success') {
    const container = document.getElementById('message-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.textContent = message;
    
    container.innerHTML = '';
    container.appendChild(messageDiv);
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        if (messageDiv.parentNode) {
            messageDiv.parentNode.removeChild(messageDiv);
        }
    }, 5000);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function validateForm(formData) {
    const errors = {};
    
    if (!formData.item_name || formData.item_name.trim() === '') {
        errors.item_name = 'Item name is required';
    }
    
    if (formData.current_count === undefined || formData.current_count === '' || formData.current_count < 0) {
        errors.current_count = 'Current count must be a non-negative number';
    }
    
    if (formData.restocks_received < 0) {
        errors.restocks_received = 'Restocks received must be a non-negative number';
    }
    
    return errors;
}

function displayValidationErrors(errors) {
    // Clear previous errors
    document.querySelectorAll('.error-message').forEach(el => el.textContent = '');
    document.querySelectorAll('input').forEach(el => el.classList.remove('error'));
    
    // Display new errors
    Object.keys(errors).forEach(field => {
        const errorElement = document.getElementById(`${field.replace('_', '-')}-error`);
        const inputElement = document.getElementById(field.replace('_', '-'));
        
        if (errorElement) {
            errorElement.textContent = errors[field];
        }
        if (inputElement) {
            inputElement.classList.add('error');
        }
    });
}

// API functions
async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        
        return data;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

// Daily Count Page Functions
function initializeDailyCount() {
    const form = document.getElementById('count-form');
    if (form) {
        form.addEventListener('submit', handleCountSubmit);
        loadTodayEntries();
        initializeTheftDetection();
        setupCalculationPreview();
    }
}

function setupCalculationPreview() {
    const restocksInput = document.getElementById('restocks-received');
    const currentInput = document.getElementById('current-count');
    
    [restocksInput, currentInput].forEach(input => {
        input.addEventListener('input', updateCalculationPreview);
    });
}

function updateCalculationPreview() {
    const restocks = parseInt(document.getElementById('restocks-received').value) || 0;
    const current = parseInt(document.getElementById('current-count').value) || 0;
    
    // We can't calculate sold without knowing yesterday's ending count
    // This will be calculated by the server
    document.getElementById('calc-starting').textContent = '?';
    document.getElementById('calc-restocks').textContent = restocks;
    document.getElementById('calc-current').textContent = current;
    document.getElementById('calc-sold').textContent = '?';
    
    const preview = document.getElementById('calculation-preview');
    if (restocks > 0 || current > 0) {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

async function handleCountSubmit(event) {
    event.preventDefault();
    
    const submitBtn = document.getElementById('submit-btn');
    const submitText = document.getElementById('submit-text');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    // Get form data
    const formData = {
        item_name: document.getElementById('item-name').value.trim(),
        current_count: parseInt(document.getElementById('current-count').value),
        restocks_received: parseInt(document.getElementById('restocks-received').value) || 0
    };
    
    // Validate form
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
        displayValidationErrors(errors);
        return;
    }
    
    // Clear previous errors
    displayValidationErrors({});
    
    // Show loading state
    submitBtn.disabled = true;
    submitText.classList.add('hidden');
    loadingSpinner.classList.remove('hidden');
    
    try {
        const result = await apiCall('/api/counts', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        if (result.success) {
            showMessage(result.message, 'success');
            document.getElementById('count-form').reset();
            document.getElementById('calculation-preview').style.display = 'none';
            loadTodayEntries();
        } else {
            showMessage(result.error || 'Failed to save count', 'error');
        }
    } catch (error) {
        showMessage(`Error: ${error.message}`, 'error');
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        loadingSpinner.classList.add('hidden');
    }
}

async function loadTodayEntries() {
    const loadingElement = document.getElementById('loading-entries');
    const noEntriesElement = document.getElementById('no-entries');
    const entriesListElement = document.getElementById('entries-list');
    
    // Show loading state
    loadingElement.classList.remove('hidden');
    noEntriesElement.classList.add('hidden');
    entriesListElement.innerHTML = '';
    
    try {
        const entries = await apiCall('/api/counts/today');
        
        loadingElement.classList.add('hidden');
        
        if (entries.length === 0) {
            noEntriesElement.classList.remove('hidden');
        } else {
            entriesListElement.innerHTML = entries.map(entry => `
                <div class="entry-item">
                    <div class="entry-details">
                        <div class="entry-name">${entry.item_name}</div>
                        <div class="entry-stats">
                            Restocks: ${entry.restocks_received} | Current: ${entry.current_count}
                        </div>
                    </div>
                    <div class="entry-actions">
                        <div class="entry-sold">${entry.sold_calculated} sold</div>
                        <button class="btn-delete" onclick="deleteEntry('${entry.item_name}', '${entry.date}')">Delete</button>
                    </div>
                </div>
            `).join('');
            
            // Update theft detection dropdown
            populateItemSelect();
        }
    } catch (error) {
        loadingElement.classList.add('hidden');
        showMessage(`Error loading today's entries: ${error.message}`, 'error');
    }
}

function initializeTheftDetection() {
    const checkTheftBtn = document.getElementById('check-theft');
    if (checkTheftBtn) {
        checkTheftBtn.addEventListener('click', handleTheftCheck);
    }
}

async function populateItemSelect() {
    try {
        const entries = await apiCall('/api/counts/today');
        const itemSelect = document.getElementById('item-select');
        
        // Clear existing options except the first one
        itemSelect.innerHTML = '<option value="">Choose an item...</option>';
        
        // Add options for today's entries
        entries.forEach(entry => {
            const option = document.createElement('option');
            option.value = entry.item_name;
            option.textContent = `${entry.item_name} (Calculated: ${entry.sold_calculated})`;
            option.dataset.calculatedSales = entry.sold_calculated;
            itemSelect.appendChild(option);
        });
    } catch (error) {
        console.error('Error loading items for theft detection:', error);
    }
}

async function handleTheftCheck() {
    const itemSelect = document.getElementById('item-select');
    const actualReceiptsInput = document.getElementById('actual-receipts');
    const theftResults = document.getElementById('theft-results');
    
    const selectedItem = itemSelect.value;
    const actualSales = parseInt(actualReceiptsInput.value);
    
    if (!selectedItem) {
        showMessage('Please select an item', 'error');
        return;
    }
    
    if (isNaN(actualSales) || actualSales < 0) {
        showMessage('Please enter a valid actual sales count', 'error');
        return;
    }
    
    const selectedOption = itemSelect.options[itemSelect.selectedIndex];
    const calculatedSales = parseInt(selectedOption.dataset.calculatedSales);
    const difference = calculatedSales - actualSales;
    
    // Update display
    document.getElementById('calculated-sales').textContent = calculatedSales;
    document.getElementById('actual-sales').textContent = actualSales;
    document.getElementById('difference').textContent = difference;
    
    // Show theft alert
    const theftAlert = document.getElementById('theft-alert');
    theftAlert.classList.remove('hidden', 'alert-success', 'alert-warning', 'alert-danger');
    
    if (difference === 0) {
        theftAlert.classList.add('alert-success');
        theftAlert.textContent = '✅ No discrepancy detected. Sales match perfectly.';
    } else if (difference > 0) {
        theftAlert.classList.add('alert-danger');
        theftAlert.textContent = `🚨 POTENTIAL THEFT DETECTED! ${difference} items missing. Calculated sales exceed actual receipts.`;
    } else {
        theftAlert.classList.add('alert-warning');
        theftAlert.textContent = `⚠️ Actual sales exceed calculated sales by ${Math.abs(difference)} items. Check for unrecorded restocks or counting errors.`;
    }
    
    theftResults.classList.remove('hidden');
}

// History Page Functions
let currentPage = 1;
const itemsPerPage = 20;

function initializeHistory() {
    loadHistory(1);
}

async function loadHistory(page = 1) {
    const loadingElement = document.getElementById('loading-history');
    const historyContent = document.getElementById('history-content');
    const noHistoryElement = document.getElementById('no-history');
    const tbody = document.getElementById('history-tbody');
    const paginationContainer = document.getElementById('pagination-container');
    
    // Show loading state
    loadingElement.classList.remove('hidden');
    historyContent.classList.add('hidden');
    noHistoryElement.classList.add('hidden');
    
    try {
        const result = await apiCall(`/api/history?page=${page}&limit=${itemsPerPage}`);
        
        loadingElement.classList.add('hidden');
        
        if (result.data.length === 0) {
            noHistoryElement.classList.remove('hidden');
        } else {
            historyContent.classList.remove('hidden');
            
            // Populate table
            tbody.innerHTML = result.data.map(entry => `
                <tr>
                    <td>${formatDate(entry.date)}</td>
                    <td>${entry.item_name}</td>
                    <td>${entry.restocks_received}</td>
                    <td>${entry.current_count}</td>
                    <td>${entry.sold_calculated}</td>
                    <td>
                        <button class="btn-delete" onclick="deleteHistoryEntry('${entry.item_name}', '${entry.date}')">Delete</button>
                    </td>
                </tr>
            `).join('');
            
            // Update pagination
            updatePagination(result.page, result.totalPages, paginationContainer);
            currentPage = result.page;
        }
    } catch (error) {
        loadingElement.classList.add('hidden');
        showMessage(`Error loading history: ${error.message}`, 'error');
    }
}

function updatePagination(currentPage, totalPages, container) {
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    // Previous button
    paginationHTML += `
        <button ${currentPage === 1 ? 'disabled' : ''} onclick="loadHistory(${currentPage - 1})">
            Previous
        </button>
    `;
    
    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);
    
    if (startPage > 1) {
        paginationHTML += `<button onclick="loadHistory(1)">1</button>`;
        if (startPage > 2) {
            paginationHTML += `<span>...</span>`;
        }
    }
    
    for (let i = startPage; i <= endPage; i++) {
        paginationHTML += `
            <button class="${i === currentPage ? 'current' : ''}" onclick="loadHistory(${i})">
                ${i}
            </button>
        `;
    }
    
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            paginationHTML += `<span>...</span>`;
        }
        paginationHTML += `<button onclick="loadHistory(${totalPages})">${totalPages}</button>`;
    }
    
    // Next button
    paginationHTML += `
        <button ${currentPage === totalPages ? 'disabled' : ''} onclick="loadHistory(${currentPage + 1})">
            Next
        </button>
    `;
    
    container.innerHTML = paginationHTML;
}

// Summary Page Functions
function initializeSummary() {
    const applyFilterBtn = document.getElementById('apply-filter');
    const daysFilter = document.getElementById('days-filter');
    
    if (applyFilterBtn) {
        applyFilterBtn.addEventListener('click', handleFilterApply);
    }
    
    if (daysFilter) {
        daysFilter.addEventListener('change', () => {
            // Clear date inputs when days filter changes
            document.getElementById('from-date').value = '';
            document.getElementById('to-date').value = '';
        });
    }
    
    // Load initial summary
    loadSummary();
}

async function handleFilterApply() {
    loadSummary();
}

async function loadSummary() {
    const loadingElement = document.getElementById('loading-summary');
    const summaryContent = document.getElementById('summary-content');
    const noSummaryElement = document.getElementById('no-summary');
    const tbody = document.getElementById('summary-tbody');
    const summaryCards = document.getElementById('summary-cards');
    
    // Show loading state
    loadingElement.classList.remove('hidden');
    summaryContent.classList.add('hidden');
    noSummaryElement.classList.add('hidden');
    
    // Get filter values
    const days = document.getElementById('days-filter').value;
    const fromDate = document.getElementById('from-date').value;
    const toDate = document.getElementById('to-date').value;
    
    // Build query parameters
    let queryParams = '';
    if (fromDate && toDate) {
        queryParams = `?from_date=${fromDate}&to_date=${toDate}`;
    } else {
        queryParams = `?days=${days}`;
    }
    
    try {
        const summary = await apiCall(`/api/summary${queryParams}`);
        
        loadingElement.classList.add('hidden');
        
        if (summary.length === 0) {
            noSummaryElement.classList.remove('hidden');
        } else {
            summaryContent.classList.remove('hidden');
            
            // Populate table
            tbody.innerHTML = summary.map(item => `
                <tr>
                    <td><strong>${item.item_name}</strong></td>
                    <td><strong style="color: #28a745; font-size: 1.1em;">${item.total_sold}</strong></td>
                    <td>${item.total_restocked}</td>
                    <td>${item.current_stock}</td>
                    <td>${item.days_tracked}</td>
                </tr>
            `).join('');
            
            // Create summary cards
            const totalSold = summary.reduce((sum, item) => sum + item.total_sold, 0);
            const totalRestocked = summary.reduce((sum, item) => sum + item.total_restocked, 0);
            const totalItems = summary.length;
            
            summaryCards.innerHTML = `
                <div class="card">
                    <div class="card-title">Total Items Sold</div>
                    <div style="font-size: 2.5rem; font-weight: bold; color: #28a745;">${totalSold}</div>
                    <small style="color: #6c757d;">Compare with receipts</small>
                </div>
                <div class="card">
                    <div class="card-title">Total Items Restocked</div>
                    <div style="font-size: 2rem; font-weight: bold; color: #007bff;">${totalRestocked}</div>
                </div>
                <div class="card">
                    <div class="card-title">Unique Items</div>
                    <div style="font-size: 2rem; font-weight: bold; color: #6f42c1;">${totalItems}</div>
                </div>
            `;
        }
    } catch (error) {
        loadingElement.classList.add('hidden');
        showMessage(`Error loading summary: ${error.message}`, 'error');
    }
}

// Navigation active state management
document.addEventListener('DOMContentLoaded', function() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('nav a');
    
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === currentPath) {
            link.classList.add('active');
        }
    });
});

async function deleteEntry(itemName, date) {
    try {
        await apiCall(`/api/counts/${itemName}/${date}`, {
            method: 'DELETE'
        });
        
        loadTodayEntries();
    } catch (error) {
        showMessage(`Error deleting entry: ${error.message}`, 'error');
    }
}

async function deleteHistoryEntry(itemName, date) {
    try {
        await apiCall(`/api/counts/${itemName}/${date}`, {
            method: 'DELETE'
        });
        
        loadHistory(currentPage);
    } catch (error) {
        showMessage(`Error deleting entry: ${error.message}`, 'error');
    }
}
