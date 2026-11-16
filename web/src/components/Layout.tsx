import { NavLink, Outlet } from 'react-router-dom';
import { cx, Icon } from './ui';

const TABS = [
  { to: '/', label: 'Asosiy', icon: 'home', end: true },
  { to: '/vitrina', label: 'Sanash', icon: 'stand' },
  { to: '/varaq', label: 'Varaq', icon: 'sheet' },
  { to: '/kassa', label: 'Kassa', icon: 'cash' },
  { to: '/yana', label: 'Yana', icon: 'more' },
];

export function Layout() {
  return (
    <div className="min-h-dvh">
      <main>
        <Outlet />
      </main>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-bean-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cx('flex flex-1 flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-medium', isActive ? 'text-bean-900' : 'text-stone-400')
              }
            >
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-7 w-12 place-items-center rounded-full transition', isActive && 'bg-bean-100')}>
                    <Icon name={t.icon} className="size-[22px]" />
                  </span>
                  {t.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
