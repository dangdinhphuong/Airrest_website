import Overview from './Overview';
import Bookings from './Bookings';
import Rooms from './Rooms';
import Inventory from './Inventory';
import Changes from './Changes';
import Shuttle from './Shuttle';
import Profile from './Profile';
import Fleet from './Fleet';
import Trips from './Trips';
import DelayOffers from './DelayOffers';
import Payouts from './Payouts';
import MyHotels from './MyHotels';
import Revenue from './Revenue';
import Staff from './Staff';
import HotelRoles from './HotelRoles';
import Settings from '../settings/Settings';

// id tab (lib/hotelNav.js) -> component.
export const HOTEL_TAB_UI = { overview: Overview, bookings: Bookings, rooms: Rooms, inventory: Inventory, changes: Changes, shuttle: Shuttle, profile: Profile, fleet: Fleet, trips: Trips, delayOffers: DelayOffers, payouts: Payouts, myHotels: MyHotels, revenue: Revenue, staff: Staff, roles: HotelRoles, settings: Settings };
