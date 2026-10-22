package vn.fpt.campusstay.repository;

import java.time.Instant;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import vn.fpt.campusstay.entity.SessionEntity;

public interface SessionRepository extends JpaRepository<SessionEntity, Long> {

    @Modifying
    @Query("update SessionEntity s set s.revokedAt = :now where s.id = :id and s.revokedAt is null")
    int revoke(@Param("id") long id, @Param("now") Instant now);

    @Modifying
    @Query("update SessionEntity s set s.revokedAt = :now where s.userId = :userId and s.revokedAt is null")
    int revokeAllOfUser(@Param("userId") long userId, @Param("now") Instant now);

    @Modifying
    @Query("""
            update SessionEntity s set s.revokedAt = :now
            where s.userId = :userId and s.id <> :keepId and s.revokedAt is null""")
    int revokeOthers(@Param("userId") long userId, @Param("keepId") long keepId, @Param("now") Instant now);

    @Modifying
    @Query("delete from SessionEntity s where s.expiresAt < :before or s.revokedAt < :before")
    int deleteExpiredBefore(@Param("before") Instant before);
}
