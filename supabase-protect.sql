-- Защита рейтинга и облачных профилей перед раздачей игры тестерам (v75).
-- Выполнить один раз: Supabase -> SQL Editor -> вставить всё -> Run.

-- 1) РЕЙТИНГ: отсекаем явный мусор на входе (старые строки не трогаем).
alter table public.scores
  add constraint scores_sane check (
    wave between 1 and 1000
    and score between 0 and 20000000
    and cups between 0 and 3000
    and char_length(name) <= 24
  ) not valid;

-- 2) ПРОФИЛИ: менять профиль может только владелец ключа устройства.
--    Игра с v75 кладёт в профиль случайный ключ (data->>'secret').
--    Чужой профиль без совпадающего ключа перезаписать нельзя;
--    ещё «не захваченные» профили (без ключа) захватываются первым сейвом.
create or replace function public.profiles_guard()
returns trigger language plpgsql as $$
begin
  if old.data->>'secret' is not null
     and (new.data->>'secret' is distinct from old.data->>'secret') then
    raise exception 'profile locked';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_tg on public.profiles;
create trigger profiles_guard_tg
  before update on public.profiles
  for each row execute function public.profiles_guard();
