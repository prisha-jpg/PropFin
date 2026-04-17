sed -i '' 's/import { api } from/import { apiClient } from/g' src/pages/setup/MasterPriceList.jsx src/pages/setup/PaymentScheduleMaster.jsx src/pages/setup/PriceSheet.jsx
sed -i '' 's/api\.get/apiClient.get/g' src/pages/setup/MasterPriceList.jsx src/pages/setup/PaymentScheduleMaster.jsx src/pages/setup/PriceSheet.jsx
sed -i '' 's/api\.post/apiClient.post/g' src/pages/setup/MasterPriceList.jsx src/pages/setup/PaymentScheduleMaster.jsx src/pages/setup/PriceSheet.jsx
sed -i '' 's/api\.delete/apiClient.delete/g' src/pages/setup/MasterPriceList.jsx src/pages/setup/PaymentScheduleMaster.jsx src/pages/setup/PriceSheet.jsx
