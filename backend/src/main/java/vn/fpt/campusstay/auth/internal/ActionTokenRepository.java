package vn.fpt.campusstay.auth.internal;

import java.time.Instant;
import java.util.Optional;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface ActionTokenRepository extends JpaRepository<ActionTokenEntity, Long> {

    /** Row lock: two parallel requests cannot both use the same link. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from ActionTokenEntity t where t.tokenHash = :hash")
    Optional<ActionTokenEntity> findForUpdate(@Param("hash") String tokenHash);

    @Query("""
            select count(t) from ActionTokenEntity t
            where t.userId = :userId and t.purpose = :purpose and t.createdAt > :since""")
    long countRecent(@Param("userId") long userId, @Param("purpose") ActionTokenEntity.Purpose purpose,
            @Param("since") Instant since);

    /** Older unused links stop working once a new one is issued. */
    @Modifying
    @Query("""
            update ActionTokenEntity t set t.usedAt = :now
            where t.userId = :userId and t.purpose = :purpose and t.usedAt is null""")
    int invalidateOpen(@Param("userId") long userId, @Param("purpose") ActionTokenEntity.Purpose purpose,
            @Param("now") Instant now);
}
