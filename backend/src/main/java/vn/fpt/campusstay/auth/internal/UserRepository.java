package vn.fpt.campusstay.auth.internal;

import java.time.Instant;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface UserRepository extends JpaRepository<UserEntity, Long> {

    @Query("select u from UserEntity u where lower(u.email) = lower(:email)")
    Optional<UserEntity> findByEmailIgnoreCase(@Param("email") String email);

    Optional<UserEntity> findByGoogleSub(String googleSub);

    /** Atomic increment, so parallel failed attempts cannot under-count. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("update UserEntity u set u.failedAttempts = u.failedAttempts + 1 where u.id = :id")
    int incrementFailedAttempts(@Param("id") long id);

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("""
            update UserEntity u set u.lockedUntil = :until, u.failedAttempts = 0
            where u.id = :id and u.failedAttempts >= :max""")
    int lockIfOverLimit(@Param("id") long id, @Param("max") int max, @Param("until") Instant until);
}
