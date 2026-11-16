import Dashboard from './Dashboard';
import Hotels from './Hotels';
import Businesses from './Businesses';
import Bookings from './Bookings';
import Support from './Support';
import Accounts from './Accounts';
import Configs from './Configs';
import Flights from './Flights';
import Payments from './Payments';
import Audit from './Audit';
import PayerDelay from './PayerDelay';
import PayerStatements from './PayerStatements';
import AdminPayers from './AdminPayers';
import AdminSettle from './AdminSettle';
import Settings from '../settings/Settings';

// id tab (lib/adminNav.js) -> component.
export const ADMIN_TAB_UI = { dashboard: Dashboard, hotels: Hotels, businesses: Businesses, bookings: Bookings, support: Support, accounts: Accounts, configs: Configs, flights: Flights, payments: Payments, audit: Audit, payerDelay: PayerDelay, payerStatements: PayerStatements, adminPayers: AdminPayers, adminSettle: AdminSettle, settings: Settings };
